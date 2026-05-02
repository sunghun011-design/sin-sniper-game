const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const roundText = document.getElementById("roundText");
const scoreText = document.getElementById("scoreText");
const timerText = document.getElementById("timerText");
const missionText = document.getElementById("missionText");
const angleTInput = document.getElementById("angleTInput");
const distanceAInput = document.getElementById("distanceAInput");
const feedback = document.getElementById("feedback");

const checkBtn = document.getElementById("checkBtn");
const fireBtn = document.getElementById("fireBtn");
const nextBtn = document.getElementById("nextBtn");

/*
  월드 좌표계
  x: 0 ~ 12
  y: 0 ~ 16
*/
const world = {
  maxX: 12,
  maxY: 16,
  pad: 28,
};

const rawStages = [
  { A: { x: 2, y: 2 },  B: { x: 10, y: 2 }, T: { x: 6, y: 10 } },
  { A: { x: 2, y: 3 },  B: { x: 10, y: 3 }, T: { x: 4.2, y: 12 } },
  { A: { x: 2, y: 2 },  B: { x: 10, y: 2 }, T: { x: 8.2, y: 11 } },
  { A: { x: 1.5, y: 3 }, B: { x: 10.5, y: 3 }, T: { x: 5.5, y: 13.5 } },
  { A: { x: 2, y: 4 },  B: { x: 10, y: 4 }, T: { x: 7, y: 14 } },
];

const state = {
  round: 0,
  score: 0,
  timeLeft: 45,
  timerId: null,
  stage: null,
  calculationUnlocked: false,
  selectedPoint: null,
  fired: false,
  gameEnded: false,
};

function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

function degToRad(deg) {
  return deg * Math.PI / 180;
}

function angleFromSides(side1, side2, opposite) {
  const cosValue =
    (side1 * side1 + side2 * side2 - opposite * opposite) /
    (2 * side1 * side2);

  return radToDeg(Math.acos(clamp(cosValue, -1, 1)));
}

function formatNum(num) {
  return Number(num.toFixed(1));
}

function buildStage(raw) {
  const AB = distance(raw.A, raw.B);
  const AT = distance(raw.A, raw.T);
  const BT = distance(raw.B, raw.T);

  const angleA = angleFromSides(AB, AT, BT);
  const angleB = angleFromSides(AB, BT, AT);
  const angleT = 180 - angleA - angleB;

  return {
    ...raw,
    AB,
    AT,
    BT,
    angleA,
    angleB,
    angleT,
  };
}

// 사인법칙으로 AT를 계산하는 함수
function solveATBySineLaw(stage) {
  return (stage.AB * Math.sin(degToRad(stage.angleB))) / Math.sin(degToRad(stage.angleT));
}

function worldToCanvas(point) {
  const usableWidth = canvas.width - world.pad * 2;
  const usableHeight = canvas.height - world.pad * 2;

  return {
    x: world.pad + (point.x / world.maxX) * usableWidth,
    y: canvas.height - world.pad - (point.y / world.maxY) * usableHeight,
  };
}

function canvasToWorld(x, y) {
  const usableWidth = canvas.width - world.pad * 2;
  const usableHeight = canvas.height - world.pad * 2;

  const worldX = ((x - world.pad) / usableWidth) * world.maxX;
  const worldY = ((canvas.height - world.pad - y) / usableHeight) * world.maxY;

  return {
    x: clamp(worldX, 0, world.maxX),
    y: clamp(worldY, 0, world.maxY),
  };
}

function updateHUD() {
  roundText.textContent = `${state.round + 1} / ${rawStages.length}`;
  scoreText.textContent = state.score;
  timerText.textContent = state.timeLeft;
}

function setFeedback(message, color = "#fde68a") {
  feedback.textContent = message;
  feedback.style.color = color;
}

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#08101d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= world.maxX; x++) {
    const p1 = worldToCanvas({ x, y: 0 });
    const p2 = worldToCanvas({ x, y: world.maxY });
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (let y = 0; y <= world.maxY; y++) {
    const p1 = worldToCanvas({ x: 0, y });
    const p2 = worldToCanvas({ x: world.maxX, y });
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}

function drawPoint(point, color, label, radius = 8) {
  const p = worldToCanvas(point);

  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(label, p.x + 10, p.y - 10);
}

function drawSelectedPoint(point) {
  if (!point) return;
  const p = worldToCanvas(point);

  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 3;

  ctx.beginPath();
  ctx.moveTo(p.x - 10, p.y);
  ctx.lineTo(p.x + 10, p.y);
  ctx.moveTo(p.x, p.y - 10);
  ctx.lineTo(p.x, p.y + 10);
  ctx.stroke();

  ctx.fillStyle = "#facc15";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("조준", p.x + 10, p.y + 18);
}

function drawRevealTarget(point) {
  const p = worldToCanvas(point);

  ctx.strokeStyle = "#fb7185";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#fb7185";
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("표적", p.x + 12, p.y - 14);
}

function drawConnectionLine(p1, p2, color = "rgba(255,255,255,0.14)") {
  const c1 = worldToCanvas(p1);
  const c2 = worldToCanvas(p2);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.stroke();
}

function render() {
  drawGrid();

  if (!state.stage) return;

  drawConnectionLine(state.stage.A, state.stage.B);

  drawPoint(state.stage.A, "#38bdf8", "A");
  drawPoint(state.stage.B, "#22c55e", "B");

  drawSelectedPoint(state.selectedPoint);

  if (state.fired) {
    drawRevealTarget(state.stage.T);
  }
}

function updateMissionText() {
  const s = state.stage;
  missionText.innerHTML = `
    기지 A와 B의 거리는 <b>${formatNum(s.AB)}</b>이고,
    관측각은 ∠A = <b>${formatNum(s.angleA)}°</b>,
    ∠B = <b>${formatNum(s.angleB)}°</b> 입니다.<br>
    사인법칙으로 <b>∠T</b>와 <b>AT</b>를 구한 뒤,
    지도에서 표적 위치를 터치하고 발사하세요.
  `;
}

function resetInputsAndButtons() {
  angleTInput.value = "";
  distanceAInput.value = "";
  state.selectedPoint = null;
  state.calculationUnlocked = false;
  state.fired = false;

  fireBtn.disabled = true;
  nextBtn.disabled = true;
  checkBtn.disabled = false;
}

function startTimer() {
  clearInterval(state.timerId);
  state.timeLeft = 45;
  updateHUD();

  state.timerId = setInterval(() => {
    state.timeLeft -= 1;
    updateHUD();

    if (state.timeLeft <= 0) {
      clearInterval(state.timerId);
      state.timeLeft = 0;
      state.fired = true;
      fireBtn.disabled = true;
      nextBtn.disabled = false;
      setFeedback("시간 종료! 정답 위치가 공개되었습니다.", "#fda4af");
      render();
    }
  }, 1000);
}

function loadRound(index) {
  if (index >= rawStages.length) {
    endGame();
    return;
  }

  state.round = index;
  state.stage = buildStage(rawStages[index]);

  resetInputsAndButtons();
  updateMissionText();
  updateHUD();
  setFeedback("먼저 ∠T와 AT를 계산해보세요.");
  startTimer();
  render();
}

function endGame() {
  clearInterval(state.timerId);
  state.gameEnded = true;
  missionText.innerHTML = `<b>게임 종료!</b><br>최종 점수: <b>${state.score}</b>`;
  setFeedback("다시 시작 버튼을 눌러 새로운 게임을 시작하세요.", "#86efac");
  nextBtn.disabled = false;
  nextBtn.textContent = "다시 시작";
  fireBtn.disabled = true;
  checkBtn.disabled = true;
}

function restartGame() {
  state.score = 0;
  state.gameEnded = false;
  nextBtn.textContent = "다음";
  loadRound(0);
}

function handleCheck() {
  const userAngleT = parseFloat(angleTInput.value);
  const userAT = parseFloat(distanceAInput.value);

  if (Number.isNaN(userAngleT) || Number.isNaN(userAT)) {
    setFeedback("∠T와 AT를 모두 입력해주세요.", "#fda4af");
    return;
  }

  const correctAngleT = state.stage.angleT;
  const correctAT = solveATBySineLaw(state.stage);

  const angleOk = Math.abs(userAngleT - correctAngleT) <= 1.0;
  const distanceOk = Math.abs(userAT - correctAT) <= 0.5;

  if (angleOk && distanceOk) {
    state.calculationUnlocked = true;
    fireBtn.disabled = false;
    setFeedback("계산 성공! 이제 맵에서 표적 위치를 터치한 뒤 발사하세요.", "#86efac");
  } else {
    state.calculationUnlocked = false;
    fireBtn.disabled = true;
    setFeedback(
      "계산이 조금 다릅니다. 대응하는 변과 각을 다시 확인해보세요.",
      "#fda4af"
    );
  }
}

function handleFire() {
  if (!state.calculationUnlocked) {
    setFeedback("먼저 계산 확인을 통과해야 발사할 수 있어요.", "#fda4af");
    return;
  }

  if (!state.selectedPoint) {
    setFeedback("먼저 지도에서 표적 위치를 터치하세요.", "#fda4af");
    return;
  }

  clearInterval(state.timerId);
  state.fired = true;
  fireBtn.disabled = true;
  nextBtn.disabled = false;

  const error = distance(state.selectedPoint, state.stage.T);

  if (error <= 0.8) {
    const gained = 100 + state.timeLeft;
    state.score += gained;
    setFeedback(
      `명중! 오차 ${formatNum(error)} / 획득 점수 +${gained}`,
      "#86efac"
    );
  } else if (error <= 1.5) {
    const gained = 40;
    state.score += gained;
    setFeedback(
      `아깝게 빗나감! 오차 ${formatNum(error)} / 위로점수 +${gained}`,
      "#fde68a"
    );
  } else {
    setFeedback(`실패! 오차 ${formatNum(error)} / 정답 위치를 확인해보세요.`, "#fda4af");
  }

  updateHUD();
  render();
}

function handleNext() {
  if (state.gameEnded) {
    restartGame();
    return;
  }
  loadRound(state.round + 1);
}

canvas.addEventListener("click", (event) => {
  if (state.fired || !state.stage) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;

  state.selectedPoint = canvasToWorld(canvasX, canvasY);
  render();

  if (state.calculationUnlocked) {
    setFeedback("조준 위치가 설정되었습니다. 발사 버튼을 누르세요.", "#93c5fd");
  } else {
    setFeedback("위치는 선택됐어요. 이제 계산 확인을 먼저 통과하세요.", "#93c5fd");
  }
});

checkBtn.addEventListener("click", handleCheck);
fireBtn.addEventListener("click", handleFire);
nextBtn.addEventListener("click", handleNext);

loadRound(0);
