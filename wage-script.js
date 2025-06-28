firebase.auth().onAuthStateChanged(user => {
  if (!user) window.location.href = "login.html";
});

window.addEventListener("DOMContentLoaded", () => {
  const db = firebase.firestore();
  let currentWageId = null;

  const startBtn = document.getElementById("startWage");
  const wageDateLabel = document.getElementById("wageDateLabel");
  const wageTableArea = document.getElementById("wageTableArea");
  // ✅ โหลด dailyWage ที่ยังเปิดอยู่ (status: "Open")
(async () => {
  const snapshot = await db.collection("dailyWages")
    .where("status", "==", "Open")
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const data = doc.data();
    currentWageId = doc.id;

    const entriesSnap = await db.collection(`dailyWages/${doc.id}/entries`).get();
    const staffList = [];

    entriesSnap.forEach(e => {
      const d = e.data();
      staffList.push({
        name: d.name || "-",
        tip: parseFloat(d.tip || 0),
        hours: parseFloat(d.duration || 0),
        daily: parseFloat(d.daily || 0),
        total: parseFloat(d.total || 0)
      });
    });

    wageDateLabel.textContent = data.date || "-";
    renderWageTable(staffList, data.date || "-");
  }
})();


  // 🔹 Popup เลือก Summary (multiple)
  const popup = document.createElement("div");
  popup.id = "wagePopup";
  Object.assign(popup.style, {
    position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
    background: "rgba(0,0,0,0.6)", display: "none",
    justifyContent: "center", alignItems: "center", zIndex: "9999"
  });
  popup.innerHTML = `
    <div style="background:white;padding:20px;border-radius:10px;max-width:500px;width:95%">
      <h3>เลือก Summary (เลือกได้หลายรายการ)</h3>
      <select id="summarySelector" multiple style="width:100%;height:200px;margin-bottom:10px;"></select>
      <label style="display:block;margin-bottom:10px;">
        📅 วันที่บันทึก: 
        <input type="date" id="customWageDate" style="width:100%">
      </label>
      <div style="text-align:right">
        <button id="confirmSummary">✅ ตกลง</button>
        <button id="cancelSummary">❌ ยกเลิก</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
  const selector = popup.querySelector("#summarySelector");

  startBtn.addEventListener("click", async () => {
  // ⏱ ตรวจสอบว่าวันนี้มีตารางแล้วหรือยัง
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];

  const existing = await db.collection("dailyWages")
    .where("date", "==", dateStr)
    .get();

  if (!existing.empty) {
    alert(`⛔ ตารางค่าแรงวันที่ ${dateStr} ถูกสร้างแล้ว ไม่สามารถสร้างซ้ำได้`);
    return;
  }

  // ✅ ถ้ายังไม่เคยสร้าง → เปิด popup เลือก summary
  selector.innerHTML = "";
  // 1. ดึงรายการที่เคยใช้ไปแล้ว
const usedSummaries = new Set();
const allDailyWages = await db.collection("dailyWages").get();
allDailyWages.forEach(doc => {
  const src = doc.data().summarySource;
  if (src) usedSummaries.add(src);
});

// 2. ดึง summaries ทั้งหมด แล้วกรองที่ไม่เคยใช้
const summariesSnap = await db.collectionGroup("summaries").get();
selector.innerHTML = "";

summariesSnap.forEach(doc => {
  const fullPath = doc.ref.path;
  if (usedSummaries.has(fullPath)) return; // ❌ ข้ามรายการที่เคยใช้แล้ว

  const data = doc.data();
  let label = fullPath;
  if (data.createdAt?.toDate) {
    const date = data.createdAt.toDate();
    label = `${date.toLocaleDateString('th-TH')} ${date.toLocaleTimeString('th-TH', {
      hour: '2-digit', minute: '2-digit'
    })}`;
  }

  const opt = document.createElement("option");
  opt.value = fullPath;
  opt.textContent = label;
  selector.appendChild(opt);
});


  summariesSnap.forEach(doc => {
    const fullPath = doc.ref.path;
    const data = doc.data();

    let label = fullPath;
    if (data.createdAt?.toDate) {
      const date = data.createdAt.toDate();
      label = `${date.toLocaleDateString('th-TH')} ${date.toLocaleTimeString('th-TH', {
        hour: '2-digit', minute: '2-digit'
      })}`;
    }

    const opt = document.createElement("option");
    opt.value = fullPath;
    opt.textContent = label;
    selector.appendChild(opt);
  });

  // ตั้งค่าช่องวันที่ด้วยวันนี้
  if (document.getElementById("customWageDate")) {
    document.getElementById("customWageDate").value = dateStr;
  }

  popup.style.display = "flex";
});


  popup.querySelector("#cancelSummary").addEventListener("click", () => {
    popup.style.display = "none";
  });

  popup.querySelector("#confirmSummary").addEventListener("click", async () => {
    const selectedPaths = Array.from(selector.selectedOptions).map(opt => opt.value);
    if (selectedPaths.length === 0) return alert("กรุณาเลือก Summary อย่างน้อย 1 รายการ");

    let staffMap = {}; // { name: { tip: total, hours: total } }

    for (const path of selectedPaths) {
      const doc = await db.doc(path).get();
      const data = doc.data();
      if (!data) continue;

      const tip = parseFloat(data.tipPerMan || 0);
      const hr = parseFloat(data.totalDurationHr || 0);

      const names = [...(data.dealers || []), ...(data.floors || [])];
      names.forEach(name => {
        if (!staffMap[name]) staffMap[name] = { tip: 0, hours: 0 };
        staffMap[name].tip += tip;
        staffMap[name].hours += hr;
      });
    }

    const dateInput = document.getElementById("customWageDate").value;
    const dateStr = dateInput || new Date().toISOString().split("T")[0];
    wageDateLabel.textContent = dateStr;
    popup.style.display = "none";

    const staffList = Object.entries(staffMap).map(([name, obj]) => ({
      name, tip: obj.tip, hours: obj.hours
    }));

    // ✅ ยังไม่บันทึก dailyWages รอให้กรอกข้อมูลก่อน
    renderWageTable(staffList, dateStr);
  });

  function renderWageTable(staffList, dateStr) {
  wageTableArea.innerHTML = ""; // ✅ เคลียร์ก่อนทุกครั้ง
  const rows = staffList.map(({ name, tip, hours, daily = 0, total = 0 }) => `
    <tr>
      <td>${dateStr}</td>
      <td>${name}</td>
      <td>${tip.toFixed(2)}</td>
      <td>${hours.toFixed(2)} ชม.</td>
      <td><input type="number" class="daily-input" value="${daily}" style="width:80px;"></td>
      <td class="total-cell">${total.toFixed(2)}</td>
      <td>
        <button class="edit-btn">✏️</button>
        <button class="delete-btn">🗑</button>
      </td>
    </tr>
  `).join("");

  wageTableArea.innerHTML = `
    <div style="text-align:right; margin-bottom:10px;">
      <button id="closeWageTable" style="background:red;color:white;padding:5px 10px;border:none;border-radius:5px;">❌ ปิดตาราง</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Name</th>
          <th>Tip/Man</th>
          <th>Duration (Hr)</th>
          <th>Daily</th>
          <th>Total</th>
          <th>Tools</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  // ✅ หลังจาก render เสร็จแล้วค่อยผูก event
  document.querySelectorAll(".daily-input").forEach(input => {
    input.addEventListener("input", () => {
      const row = input.closest("tr");
      const tip = parseFloat(row.children[2].textContent) || 0;
      const daily = parseFloat(input.value) || 0;
      row.querySelector(".total-cell").textContent = (tip + daily).toFixed(2);
    });
  });
}



// ✅ ต้องอยู่หลังจาก .innerHTML
const closeBtn = document.getElementById("closeWageTable");
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    wageTableArea.innerHTML = "";
    wageDateLabel.textContent = "";
    currentWageId = null;
  });
}

document.getElementById("saveWageTable").addEventListener("click", async () => {
  const table = document.querySelector("#wageTableArea table");
  if (!table) return alert("⛔ ยังไม่มีตารางให้บันทึก");

  const rows = table.querySelectorAll("tbody tr");
  const data = [];
  let totalPayout = 0;

  rows.forEach(row => {
    const name = row.children[1].textContent.trim();
    const tip = parseFloat(row.children[2].textContent);
    const duration = parseFloat(row.children[3].textContent);
    const dailyRaw = row.querySelector(".daily-input")?.value;
    const daily = parseFloat(dailyRaw);
    const total = tip + daily;

    if (!name || isNaN(tip) || isNaN(daily) || isNaN(duration) || isNaN(total)) {
      console.warn("❌ ข้อมูลไม่สมบูรณ์, ข้ามแถว:", { name, tip, daily, duration, total });
      return;
    }

    data.push({ name, tip, daily, duration, total });
    totalPayout += total;
  });

  if (!data.length) return alert("⛔ ไม่มีข้อมูลที่ถูกต้องให้บันทึก");

  const label = document.getElementById("wageDateLabel").textContent;
  if (!label) return alert("⛔ ไม่พบวันที่ของตาราง");

  // ✅ ตรวจสอบและสร้างเอกสารหากยังไม่มี
  const db = firebase.firestore();
  let docId = null;
  const snapshot = await db.collection("dailyWages").where("date", "==", label).limit(1).get();

  if (snapshot.empty) {
    const newDoc = await db.collection("dailyWages").add({
      date: label,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "Open",
      summarySource: "manual"
    });
    docId = newDoc.id;
  } else {
    docId = snapshot.docs[0].id;
  }

  const wageRef = db.collection("dailyWages").doc(docId);
  const entriesRef = wageRef.collection("entries");

  const batch = db.batch();

  // ลบของเก่า
  const entriesSnap = await entriesRef.get();
  entriesSnap.forEach(e => batch.delete(e.ref));

  // เพิ่มของใหม่
  data.forEach(d => {
    const newRef = entriesRef.doc();
    batch.set(newRef, d);
  });

  batch.update(wageRef, { totalPayout });

  await batch.commit();
  alert("✅ บันทึกข้อมูลเรียบร้อยแล้ว");
});



document.querySelectorAll(".daily-input").forEach(input => {
  input.addEventListener("input", () => {
    const row = input.closest("tr");
    const tip = parseFloat(row.children[2].textContent) || 0;
    const daily = parseFloat(input.value) || 0;
    row.querySelector(".total-cell").textContent = (tip + daily).toFixed(2);
  });
});

document.getElementById("deleteWageTable").addEventListener("click", () => {
    if (currentWageId) {
      db.collection("dailyWages").doc(currentWageId).delete().then(() => {
        wageTableArea.innerHTML = "";
        wageDateLabel.textContent = "";
        currentWageId = null;
        console.log("🗑 ลบตารางสำเร็จ");
      });
    }
  });
});


document.getElementById("loadWageHistory").addEventListener("click", async () => {
  const startInput = document.getElementById("wagePickerStart").value;
  const endInput = document.getElementById("wagePickerEnd").value;

  const startDateStr = new Date(startInput).toISOString().split("T")[0];
  const endDateStr = new Date(endInput).toISOString().split("T")[0];

  const snapshot = await db.collection("dailyWages")
    .orderBy("date")
    .where("date", ">=", startDateStr)
    .where("date", "<=", endDateStr)
    .get();

  const wageHistoryArea = document.getElementById("wageHistoryArea");
  wageHistoryArea.innerHTML = ""; // ✅ เคลียร์ก่อน

  if (snapshot.empty) {
    wageHistoryArea.innerHTML = "<p>ไม่พบข้อมูลในช่วงวันที่ที่เลือก</p>";
    return;
  }

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const date = data.date || "-";
    const total = parseFloat(data.totalPayout || 0);

    const entriesSnap = await db.collection(`dailyWages/${doc.id}/entries`).get();
    const staffCount = entriesSnap.size;

    const container = document.createElement("div");
    container.style = "margin-bottom: 20px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; background: #f9f9f9;";

    const header = document.createElement("div");
    header.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span><strong>📅 ${date}</strong> | 👥 ${staffCount} คน | 💰 ยอดรวมทั้งหมด: ${total.toFixed(2)} บาท</span>
        <button class="close-history-table" style="background:red; color:white; border:none; padding:3px 8px; border-radius:5px;">❌</button>
      </div>
    `;
    container.appendChild(header);

    if (!entriesSnap.empty) {
      const table = document.createElement("table");
      table.style = "width: 100%; margin-top: 10px; border-collapse: collapse;";
      table.innerHTML = `
        <thead>
          <tr style="background:#eee">
            <th style="border: 1px solid #ccc; padding: 6px;">ชื่อพนักงาน</th>
            <th style="border: 1px solid #ccc; padding: 6px;">Daily</th>
            <th style="border: 1px solid #ccc; padding: 6px;">Tip</th>
            <th style="border: 1px solid #ccc; padding: 6px;">รวมที่ได้รับ</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = table.querySelector("tbody");

      entriesSnap.forEach(e => {
        const d = e.data();
        const row = document.createElement("tr");
        row.innerHTML = `
          <td style="border: 1px solid #ccc; padding: 6px;">${d.name || "-"}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align:right;">${(d.daily || 0).toFixed(2)}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align:right;">${(d.tip || 0).toFixed(2)}</td>
          <td style="border: 1px solid #ccc; padding: 6px; text-align:right;">${(d.total || 0).toFixed(2)}</td>
        `;
        tbody.appendChild(row);
      });

      container.appendChild(table);
    }

    // ✅ เพิ่มปุ่มปิดตารางนี้
    const closeBtn = container.querySelector(".close-history-table");
    closeBtn.addEventListener("click", () => {
      container.remove();
    });

    wageHistoryArea.appendChild(container); // ✅ ใช้พื้นที่ใหม่
  }
});


document.getElementById("endWageTable").addEventListener("click", async () => {
  const label = document.getElementById("wageDateLabel").textContent;
  if (!label) return alert("⛔ ไม่พบวันที่");

  const db = firebase.firestore();
  const snapshot = await db.collection("dailyWages")
    .where("date", "==", label)
    .limit(1)
    .get();

  let docId = null;
  if (snapshot.empty) {
    const newDoc = await db.collection("dailyWages").add({
      date: label,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: "Closed",
      summarySource: "manual"
    });
    docId = newDoc.id;
  } else {
    docId = snapshot.docs[0].id;
    await db.collection("dailyWages").doc(docId).update({ status: "Closed" });
  }

  alert("✅ ปิดตารางค่าแรงเรียบร้อยแล้ว");
});





