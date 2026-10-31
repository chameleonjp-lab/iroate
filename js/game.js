import { COLORS, TOTAL_QUESTIONS, PENALTY_SECONDS, SCORE_SCALE, createGameQuestions, scoreForSeconds } from './engine.js';
import { SUPPORTED_LANGUAGES, getLanguage, setLanguage, t, translate, colorName, applyTranslations, setTranslatedText } from './i18n.js';
import {createGuestPlayCounter} from './guest-plays.js';
import { SoundEffects } from './sound-effects.js';
import {buildXShareUrl} from './x-share.js';

const soundEffects = new SoundEffects();
const languageSelect = document.getElementById('language-select');
const soundToggle = document.getElementById('sound-toggle');
let currentScreen = 'title';
let roundLanguage = getLanguage();
let roundId = 0;
let resultState = null;
let guestStartId = null;
let guestCountStatus = "counting";

// Bound fetch and a deadline preserve Safari compatibility. Score writes are
// never retried; anonymous start retries use their dedicated UUID-based queue.
async function rankingRpc(client, name, parameters) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try { return await client.rpc(name, parameters).abortSignal(controller.signal); }
  finally { clearTimeout(timeout); }
}

const BEST_TIME_STORAGE_KEY = "iroAteBestTime";
const PLAYER_NAME_STORAGE_KEY = "iroAtePlayerName";
const SUPABASE_URL = "https://mlpnjgezrnhdxsxolyzj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM";
const GAME_SLUG = "iroate";
const CLIENT_VERSION = "iroate-ranking-v1";
const PUBLIC_URL = "https://chameleonjp-lab.github.io/iroate/";
const screens = {
  title: document.getElementById("title-screen"),
  rules: document.getElementById("rules-screen"),
  countdown: document.getElementById("countdown-screen"),
  game: document.getElementById("game-screen"),
  result: document.getElementById("result-screen")
};

const titleBestTime = document.getElementById("title-best-time");
const questionCount = document.getElementById("question-count");
const timer = document.getElementById("timer");
const countdownNumber = document.getElementById("countdown-number");
const instructionText = document.getElementById("instruction-text");
const displayWord = document.getElementById("display-word");
const colorGrid = document.getElementById("color-grid");
const resultTitle = document.getElementById("result-title");
const clearTimeText = document.getElementById("clear-time");
const missCountText = document.getElementById("miss-count");
const penaltyTimeText = document.getElementById("penalty-time");
const finalTimeText = document.getElementById("final-time");
const bestMessage = document.getElementById("best-message");
const toast = document.getElementById("toast");
const playerNameInput = document.getElementById("player-name-input");
const nameError = document.getElementById("name-error");
const rankingStatus = document.getElementById("ranking-status");
const copyRankingErrorButton = document.getElementById("copy-ranking-error-button");
const rankingSummary = document.getElementById("ranking-summary");
const rankingCurrentScore = document.getElementById("ranking-current-score");
const rankingFirstScore = document.getElementById("ranking-first-score");
const rankingBestScore = document.getElementById("ranking-best-score");
const rankingPlayCount = document.getElementById("ranking-play-count");
const rankingBestMessage = document.getElementById("ranking-best-message");
const rankingPanel = document.getElementById("ranking-panel");
const bestRankingTab = document.getElementById("best-ranking-tab");
const firstRankingTab = document.getElementById("first-ranking-tab");
const rankingList = document.getElementById("ranking-list");
const rankingReadStatus = document.getElementById("ranking-read-status");
const guestCountStatusText = document.getElementById("guest-count-status");

const startButton = document.getElementById("start-button");
const rulesButton = document.getElementById("rules-button");
const rulesStartButton = document.getElementById("rules-start-button");
const backTitleButton = document.getElementById("back-title-button");
const retryButton = document.getElementById("retry-button");
const resultTitleButton = document.getElementById("result-title-button");
const retireButton = document.getElementById("retire-button");
const copyResultButton = document.getElementById("copy-result-button");
const shareButton = document.getElementById("share-button");

let currentQuestions = [];
let currentIndex = 0;
let missCount = 0;
let isAnswerLocked = false;
let startTime = 0;
let finishedTime = 0;
let penaltySeconds = 0;
let timerFrameId = null;
let isGameActive = false;
let toastTimeoutId = null;
let countdownTimeoutId = null;
let currentPlayerName = "";
let scoreSubmitted = false;
let supabaseClient = null;
let latestResultScore = null;
let latestRankingResult = null;
let bestRankingRows = [];
let firstRankingRows = [];
let activeRankingType = "best";
let lastRankingErrorText = "";

function showScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove("screen-active");
  });
  screens[screenName].classList.add("screen-active");
  currentScreen = screenName;
  languageSelect.disabled = screenName === "countdown" || screenName === "game";
}

function getSavedPlayerName() {
  try {
    return (localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "").trim().slice(0, 20);
  } catch (_error) {
    return "";
  }
}

function savePlayerName(name) {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
  } catch (_error) {
    console.warn("player name could not be saved");
  }
}

function beginStartFlow() {
  if (!['title','rules','result'].includes(currentScreen)) return;
  const name = playerNameInput.value.trim();
  if (name.length > 20) {
    setTranslatedText(nameError, '名前は20文字以内で入力してください。');
    showScreen('title');
    playerNameInput.focus();
    return;
  }
  // Capture the optional name once. A later edit cannot alter this round.
  currentPlayerName = name;
  savePlayerName(name);
  setTranslatedText(nameError, '');
  playerNameInput.blur(); // The 3-second countdown also lets the iOS keyboard close.
  roundId += 1;
  stopTimer();clearCountdown();hideToast();
  startGame();
}

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library is not loaded");
  }

  if (!SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY.includes("ここに")) {
    throw new Error("Supabase publishable key is not set");
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {global:{fetch:globalThis.fetch.bind(globalThis)}});
  return supabaseClient;
}

function setResultActionsDisabled(isDisabled) {
  [retryButton, resultTitleButton].forEach((button) => {
    button.disabled = isDisabled;
  });
  copyResultButton.setAttribute('aria-disabled', String(isDisabled));
  copyResultButton.tabIndex = isDisabled ? -1 : 0;
}

function resetRankingUi() {
  rankingStatus.hidden = true;
  setTranslatedText(rankingStatus, "");
  copyRankingErrorButton.hidden = true;
  lastRankingErrorText = "";
  rankingSummary.hidden = true;
  rankingCurrentScore.textContent = "--";
  rankingFirstScore.textContent = "--";
  rankingBestScore.textContent = "--";
  rankingPlayCount.textContent = "--";
  setTranslatedText(rankingBestMessage, "");
  rankingPanel.hidden = true;
  setTranslatedText(rankingReadStatus, "");
  guestCountStatusText.hidden = true;
  rankingList.innerHTML = "";
  bestRankingRows = [];
  firstRankingRows = [];
  latestRankingResult = null;
  activeRankingType = "best";
  setRankingTab("best");
}

function setRankingTab(type) {
  activeRankingType = type;
  bestRankingTab.classList.toggle("ranking-tab-active", type === "best");
  firstRankingTab.classList.toggle("ranking-tab-active", type === "first");
  renderRankingList();
}

function toScoreNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatScoreValue(value) {
  const numericValue = toScoreNumber(value);
  return numericValue === null ? "--" : t("{0}秒", {0: (numericValue / SCORE_SCALE).toFixed(2)});
}

function normalizeRpcResult(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}


function buildRankingErrorText(error) {
  const safeMessage = "Ranking request failed"; // Never include server messages that may contain a player name.
  const safeCode = new Set(["22023", "23505", "42501", "PGRST202", "PGRST301", "57014"]).has(error?.code) ? error.code : "";
  const safeDetails = "";
  const safeHint = "";
  const safeStatus = Number.isInteger(error?.status) ? error.status : "";
  return [
    t("イロアテ ランキング連携エラー"),
    `message: ${safeMessage}`,
    safeCode ? `code: ${safeCode}` : "",
    safeDetails ? `details: ${safeDetails}` : "",
    safeHint ? `hint: ${safeHint}` : "",
    safeStatus ? `status: ${safeStatus}` : "",
    `game_slug: ${GAME_SLUG}`,
    `client_version: ${CLIENT_VERSION}`,
    `score_scale: ${SCORE_SCALE}`,
    "p_score is sent as centiseconds. Example: 26.81 seconds -> 2681",
    `public_url: ${PUBLIC_URL}`
  ].filter(Boolean).join("\n");
}

async function loadRankings(requestRound) {
  rankingPanel.hidden = false;
  rankingList.hidden = true;
  setTranslatedText(rankingReadStatus, 'ランキングを読み込んでいます…');
  try {
    const client = getSupabaseClient();
    const [best, first] = await Promise.all([
      rankingRpc(client, 'get_best_score_ranking', {p_game_slug: GAME_SLUG, p_limit: 30}),
      rankingRpc(client, 'get_first_try_ranking', {p_game_slug: GAME_SLUG, p_limit: 30})
    ]);
    if (requestRound !== roundId) return;
    if (best.error || first.error) throw best.error || first.error;
    if (!Array.isArray(best.data) || !Array.isArray(first.data)) throw new Error('Invalid ranking response');
    bestRankingRows = best.data.slice(0, 30);
    firstRankingRows = first.data.slice(0, 30);
    setTranslatedText(rankingReadStatus, '');
    rankingList.hidden = false;
    renderRankingList();
  } catch (error) {
    if (requestRound !== roundId) return;
    setTranslatedText(rankingReadStatus, 'ランキングを取得できませんでした。');
  }
}

async function syncScoreAndRankings(finalScore) {
  if (scoreSubmitted) return;
  scoreSubmitted = true;
  const requestRound = roundId;
  if (!currentPlayerName) {
    rankingStatus.hidden = false;
    setTranslatedText(rankingStatus, '名前なしのプレイです。回数のみ計測し、スコアは登録しません。');
    renderGuestCountStatus();
    await loadRankings(requestRound);
    return;
  }
  if (finalScore === null) {await loadRankings(requestRound);return;}
  renderRankingSummary(finalScore);
  rankingStatus.hidden = false;
  setTranslatedText(rankingStatus, 'ランキング送信中です…');
  const initialRead = loadRankings(requestRound); // Viewing ranks never depends on a successful write.
  try {
    const {data, error} = await rankingRpc(getSupabaseClient(), 'submit_score', {
      p_display_name: currentPlayerName, p_game_slug: GAME_SLUG,
      p_score: finalScore, p_client_version: CLIENT_VERSION
    });
    if (requestRound !== roundId) return;
    if (error) throw error;
    const acceptedResult = normalizeRpcResult(data);
    if (acceptedResult?.accepted !== true) throw new Error('Submission was not accepted');
    latestRankingResult = acceptedResult;
    renderRankingSummary(finalScore);
    updateShareLinks();
    setTranslatedText(rankingStatus, 'ランキングに反映しました');
    await initialRead;
    if (requestRound === roundId) await loadRankings(requestRound); // Include the newly accepted result.
  } catch (error) {
    if (requestRound !== roundId) return;
    lastRankingErrorText = buildRankingErrorText(error);
    try {localStorage.setItem('iroAteRankingLastError', lastRankingErrorText);} catch { /* Optional diagnostics. */ }
    setTranslatedText(rankingStatus, 'ランキング連携に失敗しました😅');
    copyRankingErrorButton.hidden = false;
    await initialRead;
  }
}

async function sendGuestStart(startId) {
  const {data, error} = await rankingRpc(getSupabaseClient(), 'start_iroate_guest_play_v1', {
    p_start_id: startId, p_game_slug: GAME_SLUG, p_client_version: CLIENT_VERSION
  });
  if (error) throw error;
  if (data?.accepted !== true || data.start_id !== startId || data.game_slug !== GAME_SLUG || data.client_version !== CLIENT_VERSION
      || typeof data.play_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.play_id)) {
    throw Object.assign(new Error('Guest start was not acknowledged'), {
      retryable: data?.accepted !== true && data?.reason === 'play_rate_limited'
    });
  }
}

function renderGuestCountStatus() {
  if (currentScreen !== 'result' || currentPlayerName) return;
  guestCountStatusText.hidden = false;
  setTranslatedText(guestCountStatusText, {
    counted:'プレイ回数を記録しました。',
    counting:'プレイ回数を記録中です…',
    pending:'プレイ回数は通信回復後に再送します。',
    failed:'プレイ回数を記録できませんでした。'
  }[guestCountStatus]);
}
const guestPlays = createGuestPlayCounter({send:sendGuestStart,onStatus(id,status) {
  if (id !== guestStartId) return;
  guestCountStatus = status;
  renderGuestCountStatus();
}});
window.addEventListener('online', () => {void guestPlays.retry();});

function renderRankingSummary(finalScore) {
  rankingSummary.hidden = false;
  rankingCurrentScore.textContent = formatScoreValue(finalScore);

  if (latestRankingResult) {
    rankingFirstScore.textContent = formatScoreValue(latestRankingResult.result_first_score);
    rankingBestScore.textContent = formatScoreValue(latestRankingResult.result_best_score);
    rankingPlayCount.textContent = latestRankingResult.result_play_count ? t("{0}回", {0: latestRankingResult.result_play_count}) : "--";

    if (latestRankingResult.is_first_play) {
      setTranslatedText(rankingBestMessage, "初挑戦スコアを登録しました");
    } else if (latestRankingResult.is_new_best) {
      setTranslatedText(rankingBestMessage, "自己ベスト更新！");
    } else {
      setTranslatedText(rankingBestMessage, "今回の記録を送信しました");
    }
  } else {
    rankingFirstScore.textContent = "--";
    rankingBestScore.textContent = "--";
    rankingPlayCount.textContent = "--";
    setTranslatedText(rankingBestMessage, "");
  }
}

function renderRankingList() {
  if (!rankingList) {
    return;
  }

  rankingList.innerHTML = "";
  const rows = activeRankingType === "best" ? bestRankingRows : firstRankingRows;
  const scoreKey = activeRankingType === "best" ? "best_score" : "first_score";

  if (!rows.length) {
    const emptyItem = document.createElement("li");
    setTranslatedText(emptyItem, "まだランキングがありません");
    rankingList.appendChild(emptyItem);
    return;
  }

  rows.forEach((row, index) => {
    const item = document.createElement("li");

    const rank = document.createElement("span");
    rank.className = "ranking-rank";
    rank.textContent = t("{0}位", {0: row.rank_no ?? "--"});

    const name = document.createElement("span");
    name.className = "ranking-name";
    name.textContent = row.display_name || t("名無し");

    const score = document.createElement("span");
    score.className = "ranking-score";
    score.textContent = formatScoreValue(row[scoreKey]);

    item.append(rank, name, score);
    rankingList.appendChild(item);
  });
}


function formatSeconds(seconds) {
  return t("{0}秒", {0: seconds.toFixed(2)});
}

function renderColorButtons() {
  colorGrid.innerHTML = "";

  COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-button";
    button.dataset.color = color.id;
    button.textContent = colorName(color.id, roundLanguage);
    button.style.backgroundColor = color.hex;
    button.setAttribute("aria-label", translate("{0}を選ぶ", {0: colorName(color.id, roundLanguage)}, roundLanguage));
    button.addEventListener("click", () => handleAnswer(color.id));
    colorGrid.appendChild(button);
  });
}

function getElapsedSeconds() {
  return (performance.now() - startTime) / 1000;
}

function updateTimer() {
  const displayedSeconds = getElapsedSeconds() + penaltySeconds;
  setTranslatedText(timer, "{0}秒", {0:displayedSeconds.toFixed(2)});
  timerFrameId = requestAnimationFrame(updateTimer);
}

function stopTimer() {
  if (timerFrameId !== null) {
    cancelAnimationFrame(timerFrameId);
    timerFrameId = null;
  }
}

function clearCountdown() {
  if (countdownTimeoutId !== null) {
    clearTimeout(countdownTimeoutId);
    countdownTimeoutId = null;
  }
}

function renderQuestion() {
  const currentQuestion = currentQuestions[currentIndex];
  questionCount.textContent = `${currentIndex + 1} / ${TOTAL_QUESTIONS}`;
  setTranslatedText(instructionText, currentQuestion.type === "meaning" ? "【意味】で答える" : "【色】で答える");
  instructionText.dataset.type = currentQuestion.type;
  displayWord.textContent = colorName(currentQuestion.wordColorId, roundLanguage, true);
  displayWord.style.color = currentQuestion.textColorHex;
  isAnswerLocked = false;
}

function startGame() {
  roundLanguage = getLanguage();
  guestStartId = null;
  guestCountStatus = "counting";
  resultState = null;
  renderColorButtons();
  stopTimer();
  clearCountdown();
  hideToast();
  currentQuestions = [];
  currentIndex = 0;
  missCount = 0;
  penaltySeconds = 0;
  isAnswerLocked = false;
  finishedTime = 0;
  latestResultScore = null;
  scoreSubmitted = false;
  isGameActive = false;
  setResultActionsDisabled(false);
  resetRankingUi();
  setTranslatedText(timer, "{0}秒", {0:"0.00"});
  questionCount.textContent = "1 / 20";
  setTranslatedText(instructionText, "");
  setTranslatedText(displayWord, "");
  displayWord.removeAttribute("style");
  startCountdown();
}

function startCountdown() {
  let countdownValue = 3;
  countdownNumber.textContent = String(countdownValue);
  showScreen("countdown");
  soundEffects.play("countdown");

  const tick = () => {
    countdownValue -= 1;

    if (countdownValue <= 0) {
      countdownTimeoutId = null;
      startGameAfterCountdown();
      return;
    }

    countdownNumber.textContent = String(countdownValue);
    soundEffects.play("countdown");
    countdownTimeoutId = window.setTimeout(tick, 1000);
  };

  countdownTimeoutId = window.setTimeout(tick, 1000);
}

function startGameAfterCountdown() {
  currentQuestions = createGameQuestions();
  currentIndex = 0;
  isGameActive = true;
  renderQuestion();
  showScreen("game");
  startTime = performance.now();
  soundEffects.play("start");
  timerFrameId = requestAnimationFrame(updateTimer);
  if (!currentPlayerName) {
    guestStartId = guestPlays.record();
    if (!guestStartId) guestCountStatus = 'failed';
  }
}

function flashWrong() {
  document.body.classList.remove("wrong-flash");
  void document.body.offsetWidth;
  document.body.classList.add("wrong-flash");
}

function handleAnswer(selectedColorId) {
  if (isAnswerLocked || !isGameActive) {
    return;
  }

  const answeredAt = performance.now();
  isAnswerLocked = true;
  const currentQuestion = currentQuestions[currentIndex];

  if (selectedColorId !== currentQuestion.correctColorId) {
    missCount += 1;
    penaltySeconds += PENALTY_SECONDS;
    flashWrong();
    isAnswerLocked = false;
    soundEffects.play("wrong");
    return;
  }

  soundEffects.play("correct");
  currentIndex += 1;

  if (currentIndex >= TOTAL_QUESTIONS) {
    finishGame(answeredAt);
    return;
  }

  renderQuestion();
}

async function finishGame(answeredAt) {
  finishedTime = (answeredAt - startTime) / 1000;
  isGameActive = false;
  stopTimer();

  const finalSeconds = finishedTime + penaltySeconds;
  latestResultScore = scoreForSeconds(finalSeconds);
  const oldBest = getBestTime();
  const isNewBest = oldBest === null || finalSeconds < oldBest.finalTime;

  let bestSaved = true;
  if (isNewBest) {
    bestSaved = saveBestTime({
      finalTime: finalSeconds,
      clearTime: finishedTime,
      missCount,
      updatedAt: new Date().toISOString()
    });
  }

  resultState = {retired:false, isNewBest:isNewBest && bestSaved, oldBest, storageFailed:!bestSaved};
  soundEffects.play("clear");
  soundEffects.play("result", {delay:0.28, append:true});
  if (isNewBest && bestSaved) soundEffects.play("best", {delay:0.4, append:true});
  updateBestTimeDisplay();
  resetRankingUi();
  showScreen("result");
  renderResult();
  await syncScoreAndRankings(latestResultScore);
}

function retireGame() {
  if (!isGameActive) {
    return;
  }

  finishedTime = getElapsedSeconds();
  isGameActive = false;
  stopTimer();

  resultState = {retired:true};
  soundEffects.play("retire");
  resetRankingUi();
  setResultActionsDisabled(false);
  updateBestTimeDisplay();
  showScreen("result");
  renderResult();
  void syncScoreAndRankings(null);
}

function buildShareText(resultLines = []) {
  return [
    t('イロアテ'),
    t('文字の「色」か「意味」を{0}問当てるタイムアタック！', {0: TOTAL_QUESTIONS}),
    ...resultLines,
    PUBLIC_URL
  ].join('\n');
}

function buildResultCopyText() {
  if (resultState?.retired) {
    return buildShareText([t('結果：リタイア')]);
  }

  const lines = [
    t('最終タイム：{0}', {0: finalTimeText.textContent})
  ];

  if (latestRankingResult) {
    lines.push(t("初回挑戦タイム：{0}", {0: formatScoreValue(latestRankingResult.result_first_score)}));
    lines.push(t("ベストタイム：{0}", {0: formatScoreValue(latestRankingResult.result_best_score)}));
  } else {
    lines.push(t("クリアタイム：{0}", {0: clearTimeText.textContent}));
    lines.push(t("ミス：{0}", {0: missCountText.textContent}));
    lines.push(t("ペナルティ：{0}", {0: penaltyTimeText.textContent}));
  }

  return buildShareText(lines);
}

function updateShareLinks() {
  shareButton.href = buildXShareUrl(buildShareText());
  copyResultButton.href = buildXShareUrl(resultState ? buildResultCopyText() : buildShareText());
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    fallbackCopyText(text);
  }

  showToast("クリップボードにコピーしました");
}


function copyRankingErrorToClipboard() {
  const text = lastRankingErrorText || t("ランキングエラー情報がありません");
  copyTextToClipboard(text);
}

function prepareResultShareOnX(event) {
  if (copyResultButton.getAttribute('aria-disabled') === 'true') {
    event.preventDefault();
    return;
  }
  // Refresh synchronously before the browser follows the link, including a
  // ranking reply that arrived after the result screen was first rendered.
  updateShareLinks();
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function showToast(message) {
  setTranslatedText(toast, message);
  toast.hidden = false;

  if (toastTimeoutId !== null) {
    clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = window.setTimeout(() => {
    hideToast();
  }, 1000);
}

function hideToast() {
  toast.hidden = true;

  if (toastTimeoutId !== null) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
}

function getBestTime() {
  try {
    const best = JSON.parse(localStorage.getItem(BEST_TIME_STORAGE_KEY));
    return best && Number.isFinite(best.finalTime) && best.finalTime >= 0 ? best : null;
  } catch { return null; }
}

function saveBestTime(bestTime) {
  try { localStorage.setItem(BEST_TIME_STORAGE_KEY, JSON.stringify(bestTime)); return true; }
  catch { return false; /* Ranking remains independent of local storage. */ }
}

function updateBestTimeDisplay() {
  const best = getBestTime();
  titleBestTime.textContent = best ? t("ベストタイム：{0}", {0: formatSeconds(best.finalTime)}) : t("ベストタイム：未記録");
}

startButton.addEventListener("click", beginStartFlow);
rulesStartButton.addEventListener("click", beginStartFlow);
rulesButton.addEventListener("click", () => showScreen("rules"));
backTitleButton.addEventListener("click", () => {
  clearCountdown();
  setResultActionsDisabled(false);
  updateBestTimeDisplay();
  roundId += 1;
  showScreen("title");
});
retryButton.addEventListener("click", beginStartFlow);
resultTitleButton.addEventListener("click", () => {
  clearCountdown();
  hideToast();
  setResultActionsDisabled(false);
  updateBestTimeDisplay();
  roundId += 1;
  showScreen("title");
});
retireButton.addEventListener("click", retireGame);
copyResultButton.addEventListener('click', prepareResultShareOnX);
shareButton.addEventListener('click', updateShareLinks);
playerNameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.isComposing) {event.preventDefault();beginStartFlow();}
});
bestRankingTab.addEventListener("click", () => setRankingTab("best"));
firstRankingTab.addEventListener("click", () => setRankingTab("first"));
copyRankingErrorButton.addEventListener("click", copyRankingErrorToClipboard);



function updateSoundButton() {
  soundToggle.setAttribute('aria-pressed', String(soundEffects.enabled));
  document.getElementById('sound-icon').textContent = soundEffects.enabled ? '🔊' : '🔇';
  setTranslatedText(document.getElementById('sound-label'), soundEffects.enabled ? '効果音 オン' : '効果音 オフ');
}

function renderResult() {
  if (!resultState) return;
  const {retired, isNewBest, oldBest} = resultState;
  setTranslatedText(resultTitle, retired ? 'リタイア' : isNewBest ? 'ベスト更新！' : 'クリア！');
  if (retired) {
    setTranslatedText(clearTimeText, 'リタイア');
    setTranslatedText(finalTimeText, 'リタイア');
    setTranslatedText(bestMessage, 'リタイアしたため、ベストタイムには反映しません。');
  } else {
    setTranslatedText(clearTimeText, '{0}秒', {0:finishedTime.toFixed(2)});
    setTranslatedText(finalTimeText, '{0}秒', {0:(finishedTime+penaltySeconds).toFixed(2)});
    if (resultState.storageFailed) setTranslatedText(bestMessage, "このブラウザには自己ベストを保存できませんでした。");
    else if (isNewBest) setTranslatedText(bestMessage, '端末内のベストタイムを更新しました。');
    else if (oldBest) setTranslatedText(bestMessage, '現在のベスト：{0}', {0:formatSeconds(oldBest.finalTime)});
    else setTranslatedText(bestMessage, '');
  }
  setTranslatedText(missCountText, '{0}回', {0:missCount});
  // Use a translated seconds template; the plus sign is language-independent.
  penaltyTimeText.removeAttribute('data-i18n');
  penaltyTimeText.textContent = `+${t('{0}秒', {0:penaltySeconds})}`;
  if (!retired && currentPlayerName && latestResultScore !== null) renderRankingSummary(latestResultScore);
  else rankingSummary.hidden = true;
  renderGuestCountStatus();
  updateShareLinks();
}

for (const {id, name} of SUPPORTED_LANGUAGES) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = name;
  languageSelect.appendChild(option);
}
languageSelect.value = getLanguage();
languageSelect.addEventListener('change', () => {
  if (languageSelect.disabled || currentScreen === 'countdown' || currentScreen === 'game') {
    languageSelect.value = getLanguage();
    return;
  }
  setLanguage(languageSelect.value);
  languageSelect.value = getLanguage();
  roundLanguage = getLanguage();
  applyTranslations();
  renderColorButtons();
  updateBestTimeDisplay();
  renderResult();
  renderRankingList();
  updateSoundButton();
  updateShareLinks();
});

soundToggle.addEventListener('click', () => {
  void soundEffects.setEnabled(!soundEffects.enabled);
  updateSoundButton();
});

// Unlock directly from trusted interaction, with no dependency in game timing.
for (const name of ['pointerdown', 'keydown', 'click']) document.addEventListener(name, () => { void soundEffects.unlock(); }, {capture:true});
document.addEventListener('visibilitychange', () => soundEffects.handleVisibility(document.hidden));
window.addEventListener('pagehide', () => soundEffects.handleVisibility(true));
window.addEventListener('pageshow', () => soundEffects.handleVisibility(document.hidden));
document.addEventListener('click', event => {
  const button = event.target.closest('button, a');
  if (!button || button.disabled || button.classList.contains('color-button') || ['sound-toggle','retire-button'].includes(button.id)) return;
  soundEffects.play(['back-title-button','name-back-button','result-title-button'].includes(button.id) ? 'cancel' : 'select');
}, {capture:true});

applyTranslations();
updateSoundButton();
updateShareLinks();
renderColorButtons();
updateBestTimeDisplay();
timer.textContent = formatSeconds(0);

playerNameInput.value = getSavedPlayerName();
void guestPlays.retry();
