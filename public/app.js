import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const authView = $("#auth-view");
const appView = $("#app-view");
const authForm = $("#auth-form");
const authMessage = $("#auth-message");
const setupMessage = $("#setup-message");
const appMessage = $("#app-message");
const emailSubmit = $("#email-submit");
const googleButton = $("#google-button");
const switchButton = $("#auth-switch");
const audioPlayer = $("#audio-player");
const trackNote = $("#track-note");

let auth;
let db;
let user;
let isRegistering = false;
let tracks = [];
let trackRecords = new Map();
let dayRecords = new Map();
let activeTrack;

const configReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const weekdayNames = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle("notice-warn", isError);
}

function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function trackId(name) {
  return encodeURIComponent(name).replaceAll("/", "%2F");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function setAuthMode(registering) {
  isRegistering = registering;
  $("#auth-title").textContent = registering ? "สร้างบัญชีใหม่" : "กลับมาเรียนต่อ";
  $("#auth-description").textContent = registering
    ? "สมัครสมาชิกเพื่อเริ่มบันทึกความก้าวหน้า"
    : "เข้าสู่ระบบเพื่อบันทึกความก้าวหน้าของคุณ";
  $("#email-submit").textContent = registering ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  $("#auth-switch-copy").textContent = registering ? "มีบัญชีอยู่แล้ว?" : "ยังไม่มีบัญชี?";
  switchButton.textContent = registering ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
  $("#password").autocomplete = registering ? "new-password" : "current-password";
  authMessage.textContent = "";
}

function setSignedInView(signedIn) {
  authView.hidden = signedIn;
  appView.hidden = !signedIn;
}

function showAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ",
    "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
    "auth/weak-password": "รหัสผ่านควรมีอย่างน้อย 6 ตัวอักษร",
    "auth/popup-closed-by-user": "ปิดหน้าต่าง Google ก่อนเข้าสู่ระบบสำเร็จ",
    "auth/operation-not-allowed": "ยังไม่ได้เปิดวิธีเข้าสู่ระบบนี้ใน Firebase",
    "auth/unauthorized-domain": "โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Authentication",
  };
  authMessage.textContent = messages[error.code] || `เข้าสู่ระบบไม่สำเร็จ: ${error.message}`;
}

async function loadTracks() {
  const response = await fetch("./audio/playlist.json");
  if (!response.ok) throw new Error("โหลดรายการไฟล์เสียงไม่สำเร็จ");
  const playlist = await response.json();
  if (!Array.isArray(playlist)) throw new Error("รูปแบบรายการไฟล์เสียงไม่ถูกต้อง");
  tracks = playlist
    .filter((track) => track && typeof track.name === "string" && typeof track.src === "string")
    .map((track) => ({ id: trackId(track.id || track.name), name: track.name, src: track.src }));
  renderTrackList();
}

function renderTrackList() {
  const list = $("#track-list");
  list.replaceChildren();
  $("#track-count").textContent = String(tracks.length);
  if (tracks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "track-empty";
    empty.textContent = "ยังไม่มีเสียงในรายการ เลือกไฟล์จากเครื่องเพื่อเริ่มฟัง";
    list.append(empty);
    return;
  }
  for (const track of tracks) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `track-item${activeTrack?.id === track.id ? " selected" : ""}`;
    const icon = document.createElement("span");
    icon.className = "track-item-icon";
    icon.textContent = "♫";
    const name = document.createElement("span");
    name.className = "track-item-name";
    name.textContent = track.name;
    button.append(icon, name);
    button.addEventListener("click", () => selectTrack(track));
    list.append(button);
  }
}

async function loadUserData() {
  const [daySnapshot, trackSnapshot] = await Promise.all([
    getDocs(collection(db, "users", user.uid, "days")),
    getDocs(collection(db, "users", user.uid, "tracks")),
  ]);
  dayRecords = new Map(daySnapshot.docs.map((entry) => [entry.id, entry.data()]));
  trackRecords = new Map(trackSnapshot.docs.map((entry) => [entry.id, entry.data()]));
  renderDashboard();
  renderTrackList();
}

function getActiveDayCount(dateKey) {
  const day = dayRecords.get(dateKey);
  return day ? Number(day.listenCount || 0) : 0;
}

function renderDashboard() {
  const now = new Date();
  const todayKey = getLocalDate(now);
  const monthPrefix = todayKey.slice(0, 7);
  const monthlyDays = [...dayRecords.entries()].filter(([key]) => key.startsWith(monthPrefix));
  const listenTotal = [...trackRecords.values()].reduce((sum, record) => sum + Number(record.listenCount || 0), 0);
  const studyDays = monthlyDays.filter(([, day]) => Number(day.listenCount || 0) > 0).length;
  const attendanceDays = monthlyDays.filter(([, day]) => day.checkedIn).length;
  let missedDays = 0;
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let date = new Date(firstDay); date < new Date(now.getFullYear(), now.getMonth(), now.getDate()); date.setDate(date.getDate() + 1)) {
    const weekday = date.getDay();
    const key = getLocalDate(date);
    if (weekday !== 0 && weekday !== 6 && !dayRecords.get(key)?.checkedIn && getActiveDayCount(key) === 0) missedDays++;
  }
  $("#total-listens").textContent = String(listenTotal);
  $("#study-days").textContent = String(studyDays);
  $("#missed-days").textContent = String(missedDays);
  $("#streak-days").textContent = String(calculateStreak(todayKey));
  $("#today-label").textContent = formatDate(now);
  $("#checkin-button").disabled = Boolean(dayRecords.get(todayKey)?.checkedIn);
  $("#checkin-button").classList.toggle("checked", Boolean(dayRecords.get(todayKey)?.checkedIn));
  $("#checkin-button").innerHTML = dayRecords.get(todayKey)?.checkedIn ? "เช็คอินแล้ว <span>✓</span>" : "เช็คอินวันนี้ <span>→</span>";
  $("#checkin-status").textContent = `${attendanceDays} วันเช็คอินเดือนนี้ · เรียน ${studyDays} วัน`;
  renderWeekChart(now);
}

function calculateStreak(todayKey) {
  let date = new Date(`${todayKey}T12:00:00`);
  if (getActiveDayCount(todayKey) === 0 && !dayRecords.get(todayKey)?.checkedIn) date.setDate(date.getDate() - 1);
  let streak = 0;
  while (true) {
    const key = getLocalDate(date);
    const day = dayRecords.get(key);
    if (!day || (!day.checkedIn && Number(day.listenCount || 0) === 0)) break;
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

function renderWeekChart(now) {
  const chart = $("#week-chart");
  chart.replaceChildren();
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const maxCount = Math.max(1, ...week.map((date) => getActiveDayCount(getLocalDate(date))));
  for (const date of week) {
    const key = getLocalDate(date);
    const day = dayRecords.get(key);
    const wrapper = document.createElement("div");
    wrapper.className = `chart-day${key === getLocalDate(now) ? " today" : ""}`;
    const bars = document.createElement("div");
    bars.className = "chart-track";
    const listens = document.createElement("i");
    listens.className = "chart-bar";
    listens.style.height = `${Math.max(3, (getActiveDayCount(key) / maxCount) * 58)}px`;
    listens.title = `${getActiveDayCount(key)} ครั้ง`;
    bars.append(listens);
    if (day?.checkedIn) {
      const checkin = document.createElement("i");
      checkin.className = "chart-bar checkin-bar";
      checkin.style.height = "8px";
      checkin.title = "เช็คอินแล้ว";
      bars.append(checkin);
    }
    const label = document.createElement("span");
    label.textContent = weekdayNames[date.getDay()];
    wrapper.append(bars, label);
    chart.append(wrapper);
  }
}

function selectTrack(track) {
  activeTrack = track;
  audioPlayer.pause();
  audioPlayer.src = track.src;
  $("#empty-player").hidden = true;
  $("#active-player").hidden = false;
  $("#active-track-name").textContent = track.name;
  const record = trackRecords.get(track.id);
  trackNote.value = record?.note || "";
  $("#track-listens").textContent = `ฟังจบแล้ว ${Number(record?.listenCount || 0)} ครั้ง`;
  $("#note-status").textContent = "";
  renderTrackList();
}

async function recordListen() {
  if (!user || !activeTrack) return;
  const today = getLocalDate();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, "users", user.uid, "tracks", activeTrack.id), {
      listenCount: increment(1),
      lastListenedAt: serverTimestamp(),
    }, { merge: true });
    batch.set(doc(db, "users", user.uid, "days", today), {
      listenCount: increment(1),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    showMessage(appMessage, "");
    await loadUserData();
    if (activeTrack) selectTrack(activeTrack);
  } catch (error) {
    showMessage(appMessage, `บันทึกสถิติการฟังไม่สำเร็จ: ${error.message}`, true);
  }
}

async function saveNote() {
  if (!user || !activeTrack) return;
  const button = $("#save-note");
  button.disabled = true;
  try {
    await setDoc(doc(db, "users", user.uid, "tracks", activeTrack.id), {
      note: trackNote.value,
      noteUpdatedAt: serverTimestamp(),
    }, { merge: true });
    const existing = trackRecords.get(activeTrack.id) || {};
    trackRecords.set(activeTrack.id, { ...existing, note: trackNote.value });
    $("#note-status").textContent = "บันทึกแล้ว";
  } catch (error) {
    $("#note-status").textContent = `บันทึกไม่สำเร็จ: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function checkIn() {
  const today = getLocalDate();
  try {
    await setDoc(doc(db, "users", user.uid, "days", today), {
      checkedIn: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await loadUserData();
    showMessage(appMessage, "เช็คอินเรียบร้อยแล้ว เยี่ยมมากที่กลับมาเรียนวันนี้!");
  } catch (error) {
    showMessage(appMessage, `เช็คอินไม่สำเร็จ: ${error.message}`, true);
  }
}

function addLocalAudioFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith("audio/")) continue;
    const id = trackId(file.name);
    const existingTrack = tracks.find((track) => track.id === id);
    if (existingTrack) continue;
    const src = URL.createObjectURL(file);
    tracks.push({ id, name: file.name, src });
  }
  renderTrackList();
}

switchButton.addEventListener("click", () => setAuthMode(!isRegistering));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  const email = $("#email").value.trim();
  const password = $("#password").value;
  try {
    if (isRegistering) await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showAuthError(error);
  }
});
googleButton.addEventListener("click", async () => {
  authMessage.textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    showAuthError(error);
  }
});
$("#signout-button").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showMessage(appMessage, `ออกจากระบบไม่สำเร็จ: ${error.message}`, true);
  }
});
$("#checkin-button").addEventListener("click", checkIn);
$("#save-note").addEventListener("click", saveNote);
$("#audio-files").addEventListener("change", (event) => {
  addLocalAudioFiles(event.target.files);
  event.target.value = "";
});
audioPlayer.addEventListener("ended", recordListen);
audioPlayer.addEventListener("error", () => {
  showMessage(appMessage, "เปิดไฟล์เสียงไม่สำเร็จ กรุณาตรวจสอบไฟล์หรือ URL ใน playlist", true);
});

async function start() {
  try {
    await loadTracks();
  } catch (error) {
    showMessage(appMessage, error.message, true);
  }
  if (!configReady) {
    setupMessage.textContent = "ตั้งค่า Firebase ก่อนใช้งาน: เพิ่ม Firebase web config ในไฟล์ public/firebase-config.js และทำตามขั้นตอนใน README";
    setupMessage.hidden = false;
    emailSubmit.disabled = true;
    googleButton.disabled = true;
    switchButton.disabled = true;
    return;
  }
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    onAuthStateChanged(auth, async (currentUser) => {
      user = currentUser;
      setSignedInView(Boolean(currentUser));
      if (!currentUser) return;
      $("#user-name").textContent = currentUser.displayName?.split(" ")[0] || currentUser.email?.split("@")[0] || "นักเรียน";
      try {
        await loadUserData();
        showMessage(appMessage, "");
      } catch (error) {
        showMessage(appMessage, `โหลดข้อมูลการเรียนไม่สำเร็จ: ${error.message}`, true);
      }
    });
  } catch (error) {
    setupMessage.textContent = `เริ่มต้น Firebase ไม่สำเร็จ: ${error.message}`;
    setupMessage.hidden = false;
    emailSubmit.disabled = true;
    googleButton.disabled = true;
    switchButton.disabled = true;
  }
}

start();
