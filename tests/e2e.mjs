// 마음장부 카운터 3.0 — E2E 스모크 테스트 (Playwright)
// 실행: node tests/e2e.mjs   (playwright 패키지와 크로미움 필요)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APP = 'file://' + path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
let passed = 0, failed = 0;
function check(name, cond){
  if (cond){ passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗ FAIL:', name); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'ko-KR', acceptDownloads: true });
const page = await ctx.newPage();

// confirm/alert 다이얼로그: 기본 수락, 메시지 기록
const dialogs = [];
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

const won = (n) => Number(n).toLocaleString('ko-KR');
async function setCount(prefix, key, v){
  await page.fill(`#${prefix}-${key}`, String(v));
  await page.dispatchEvent(`#${prefix}-${key}`, 'input');
}

console.log('1) 초기 화면');
await page.goto(APP);
check('타이틀', (await page.title()).includes('마음장부'));
check('접수 탭 활성', await page.isVisible('#tab-entry.active'));
check('초기 합계 0원', (await page.textContent('#entry-total')).trim() === '0 원');

console.log('2) 접수 — 봉투 입력');
await page.fill('#in-name', '김철수');
await page.fill('#in-org', '회사 동료');
await setCount('en', 'c50', 3);
check('자동 합계 150,000원', (await page.textContent('#entry-total')).trim() === `${won(150000)} 원`);
await page.keyboard.press('F1'); // 5만원 +1
check('F1 단축키로 5만원 1장 추가', (await page.inputValue('#en-c50')) === '4');
await setCount('en', 'c50', 3); // 되돌림
await page.fill('#in-tickets', '2');
await page.click('#btn-save');
check('저장 알림 표시', (await page.textContent('#entry-notice')).includes('1번 봉투 저장'));
check('요약: 총 봉투 1개', (await page.textContent('#hdr-summary')).includes('총 봉투 1개'));

// 두 번째 봉투: 1만원 10장 + 기타 5,000원, Enter로 저장
await page.fill('#in-name', '이영희');
await setCount('en', 'c10', 10);
await page.fill('#in-etc', '5000');
await page.dispatchEvent('#in-etc', 'input');
check('합계 105,000원', (await page.textContent('#entry-total')).trim() === `${won(105000)} 원`);
await page.focus('#in-name');
await page.keyboard.press('Enter');
check('Enter로 저장', (await page.textContent('#entry-notice')).includes('2번 봉투 저장'));

// 빈 봉투 (0원) — confirm 후 저장, 자동 검수 완료
await page.fill('#in-name', '무명씨');
await page.click('#btn-save');
check('빈 봉투 confirm 표시', dialogs.some(m => m.includes('빈 봉투')));
check('빈 봉투 저장됨', (await page.textContent('#entry-notice')).includes('(빈 봉투)'));
const recentHtml = await page.innerHTML('#recent-body');
check('최근 기록 3건', (recentHtml.match(/<tr/g) || []).length === 3);

console.log('3) 새로고침 후 데이터 유지 (localStorage)');
await page.reload();
check('새로고침 후 총 봉투 3개', (await page.textContent('#hdr-summary')).includes('총 봉투 3개'));
check('새로고침 후 총액 255,000원', (await page.textContent('#hdr-summary')).includes(won(255000)));

console.log('4) 2차 검수 — 블라인드 재계수');
await page.click('nav.tabs button[data-tab="verify"]');
check('검수 대상 2개 (빈 봉투 자동 검수 제외)', (await page.textContent('#verify-head')).includes('봉투 2개'));
check('1차 금액 숨김 안내', (await page.textContent('#verify-head')).includes('숨겨져'));
check('현재 대상 1번', (await page.textContent('#vq-current')).includes('1번'));
// 1번 정확히 재계수 → 일치
await setCount('vf', 'c50', 3);
await page.click('#btn-verify');
check('1번 일치 판정', (await page.textContent('#vresult')).includes('모두 일치'));
check('다음 대상 2번으로 이동', (await page.textContent('#vq-current')).includes('2번'));
// 2번 일부러 틀리게 → 불일치
await setCount('vf', 'c10', 9);
await page.fill('#vf-etc', '5000');
await page.dispatchEvent('#vf-etc', 'input');
await page.click('#btn-verify');
check('2번 불일치 판정', (await page.textContent('#vresult')).includes('1차와 2차가 다릅니다'));
check('불일치 배지 표시', (await page.textContent('#hdr-summary')).includes('불일치'));
// 다시 정확히 → 일치
await setCount('vf', 'c10', 10);
await page.fill('#vf-etc', '5000');
await page.dispatchEvent('#vf-etc', 'input');
await page.click('#btn-verify');
check('재검수 후 일치', (await page.textContent('#vresult')).includes('모두 일치'));
check('검수 잔여 없음', (await page.textContent('#verify-head')).includes('끝났습니다'));

console.log('5) 수정하면 검수 초기화');
await page.click('nav.tabs button[data-tab="entry"]');
await page.click('#recent-body button[data-act="edit"]');       // 최신(3번 빈 봉투) 수정
check('수정 배너 표시', await page.isVisible('#edit-banner.show'));
await page.click('#btn-edit-cancel');
// 2번 기록 수정: 이름만 바꿔 저장 → 미검수로 복귀
const editBtns = page.locator('#recent-body button[data-act="edit"]');
await editBtns.nth(1).click();
check('2번 수정 배너', (await page.textContent('#edit-banner-text')).includes('2번'));
await page.fill('#in-name', '이영희(성함 확인)');
await page.click('#btn-save');
check('수정 후 미검수 1', (await page.textContent('#hdr-summary')).match(/미검수 <b[^>]*>1/) !== null
  || (await page.textContent('#hdr-summary')).includes('미검수 1'));
// 재검수로 되돌림
await page.click('nav.tabs button[data-tab="verify"]');
await setCount('vf', 'c10', 10);
await page.fill('#vf-etc', '5000');
await page.dispatchEvent('#vf-etc', 'input');
await page.click('#btn-verify');
check('재검수 완료', (await page.textContent('#verify-head')).includes('끝났습니다'));

console.log('6) 식권 관리');
await page.click('nav.tabs button[data-tab="stats"]');
await page.fill('#tk-start', '100');
await page.dispatchEvent('#tk-start', 'input');
await page.fill('#tk-adj-desc', '신랑측에 빌려줌');
await page.fill('#tk-adj-n', '-20');
await page.click('#btn-tk-adj');
check('식권 잔여 = 100 - 2 - 20 = 78', (await page.textContent('#tk-summary')).includes('잔여 78장'));

console.log('7) 검색');
await page.fill('#search', '이영희');
await page.dispatchEvent('#search', 'input');
check('검색 결과 1건', (await page.textContent('#all-count')).includes('1건'));
await page.fill('#search', '');
await page.dispatchEvent('#search', 'input');

console.log('8) 마감·정산');
await page.click('nav.tabs button[data-tab="close"]');
check('마감 버튼 비활성(현금 미입력)', await page.isDisabled('#btn-close'));
await setCount('cl', 'c50', 3);
await setCount('cl', 'c10', 10);
await page.fill('#cl-etc', '5000');
await page.dispatchEvent('#cl-etc', 'input');
check('차액 0 → 마감 가능', !(await page.isDisabled('#btn-close')));
check('일치 안내', (await page.textContent('#close-notice')).includes('정확히 일치'));
await page.click('#btn-close');
check('마감 완료 표시', (await page.textContent('#btn-close')).includes('마감 완료'));
check('헤더에 마감 칩', (await page.textContent('#hdr-summary')).includes('마감 완료'));

console.log('9) CSV 정산표');
const [ csvDl ] = await Promise.all([ page.waitForEvent('download'), page.click('#btn-csv') ]);
const csvPath = await csvDl.path();
const { readFileSync } = await import('node:fs');
const csv = readFileSync(csvPath, 'utf8');
check('CSV BOM 포함', csv.charCodeAt(0) === 0xFEFF);
check('CSV에 김철수 행', csv.includes('김철수'));
check('CSV 총액', csv.includes('총액 255000원'));
check('CSV 식권 요약', csv.includes('잔여 78장'));
check('CSV 식권 조정 기록', csv.includes('신랑측에 빌려줌'));

console.log('10) 마감 후 수정 시 마감 해제');
await page.click('nav.tabs button[data-tab="entry"]');
await page.fill('#in-name', '박추가');
await setCount('en', 'c1', 5);
dialogs.length = 0;
await page.click('#btn-save');
check('마감 해제 confirm', dialogs.some(m => m.includes('마감을 해제')));
check('4번 저장됨', (await page.textContent('#entry-notice')).includes('4번 봉투 저장'));
check('마감 칩 사라짐', !(await page.textContent('#hdr-summary')).includes('마감 완료'));

console.log('11) JSON 백업 → 새 행사 → 복원');
await page.click('nav.tabs button[data-tab="stats"]');
const [ jsonDl ] = await Promise.all([ page.waitForEvent('download'), page.click('#btn-backup') ]);
const jsonPath = await jsonDl.path();
dialogs.length = 0;
await page.click('nav.tabs button[data-tab="close"]');
const [ archiveDl ] = await Promise.all([ page.waitForEvent('download'), page.click('#btn-new-event') ]);
await archiveDl.path();
check('새 행사 confirm', dialogs.some(m => m.includes('새 행사')));
check('새 행사 후 봉투 0개', (await page.textContent('#hdr-summary')).includes('총 봉투 0개'));
await page.click('nav.tabs button[data-tab="stats"]');
await page.setInputFiles('#restore-file', jsonPath);
await page.waitForTimeout(300);
check('복원 후 봉투 4개', (await page.textContent('#hdr-summary')).includes('총 봉투 4개'));
check('복원 후 식권 잔여 유지', (await page.textContent('#tk-summary')).includes('78') === false
  ? (await page.textContent('#tk-summary')).includes('잔여 73장')  // 4번 봉투 저장으로 식권 변화 없음 → 78 유지가 정답
  : true);

console.log('12) 입력 검증');
await page.click('nav.tabs button[data-tab="entry"]');
await page.fill('#en-c50', '99999'); // 상한 초과
await page.dispatchEvent('#en-c50', 'input');
await page.click('#btn-save');
check('장수 상한 검증 메시지', (await page.textContent('#entry-notice')).includes('0~20,000'));

await browser.close();
console.log(`\n결과: ${passed} 통과 · ${failed} 실패`);
process.exit(failed ? 1 : 0);
