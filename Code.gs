// ════════════════════════════════════════════════════════════════
// Shadow's Car Wash & Detailing — Google Apps Script Backend
// Replace ALL contents of Code.gs with this file, then redeploy
// ════════════════════════════════════════════════════════════════

var SHEET_NAME    = "Bookings";
var MEMBERS_SHEET = "Members";
var WASH_LOG      = "WashLog";
var LOG_SHEET     = "ActivityLog";

// ── Entry Point ───────────────────────────────────────────────
// FIX 1: Added membership routing
// FIX 2: Added setSandboxMode(IFRAME) — stops CSS sanitizer stripping position:fixed etc.
// FIX 3: Moved ADMIN_EMAIL inside functions (not top-level) to avoid anonymous-user errors
function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : "index";
  var file, title;
  if (page === "dashboard") {
    file  = "Dashboard";
    title = "Shadow's Detailing — Dashboard";
  } else if (page === "membership") {
    file  = "Membership";
    title = "Shadow's — Membership Portal";
  } else {
    file  = "Index";
    title = "Shadow's Car Wash & Detailing";
  }
  return HtmlService.createTemplateFromFile(file)
    .evaluate()
    .setTitle(title)
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── Helpers ──────────────────────────────────────────────────
function getOrCreateSheet(name, headers) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      var hRow = sheet.getRange(1, 1, 1, headers.length);
      hRow.setValues([headers]);
      hRow.setFontWeight("bold");
      hRow.setBackground("#0A0A0A");
      hRow.setFontColor("#C8A84B");
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    }
  }
  return sheet;
}

function nowStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}
function todayStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}
function thisMonthStr() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
}

function logActivity(action, detail) {
  try {
    var sheet = getOrCreateSheet(LOG_SHEET, ["Timestamp", "Action", "Detail"]);
    sheet.appendRow([nowStr(), action, detail]);
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
// BOOKINGS
// ════════════════════════════════════════════════════════════════
function saveBooking(data) {
  try {
    var sheet = getOrCreateSheet(SHEET_NAME, [
      "Ref", "Timestamp", "Status", "Customer Name", "Phone",
      "Car Model", "Reg Plate", "Car Type", "Service", "Category",
      "Price (\u20B9)", "Date", "Time", "Notes", "Payment Status"
    ]);
    var ref = "SHD-" + String(Math.floor(Math.random() * 9000 + 1000));
    sheet.appendRow([
      ref, nowStr(), "Confirmed",
      data.customerName || "-",
      data.phone        || "-",
      data.carModel     || "-",
      data.regPlate     || "-",
      data.carType      || "-",
      data.service      || "-",
      data.category     || "-",
      Number(data.price || 0),
      data.date         || "-",
      data.time         || "-",
      data.notes        || "",
      "Pending"
    ]);
    sheet.autoResizeColumns(1, 15);
    try { sendConfirmationEmail(data, ref); } catch(e) {}
    logActivity("NEW_BOOKING", ref + " - " + data.customerName + " - " + data.service);
    return { success: true, ref: ref };
  } catch(err) {
    return { success: false, error: err.message };
  }
}

function getBookings() {
  try {
    var sheet   = getOrCreateSheet(SHEET_NAME, []);
    var data    = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, rows: [] };
    var headers = data[0];
    var rows    = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) obj[String(headers[j])] = data[i][j];
      obj._rowIndex = i + 1;
      rows.push(obj);
    }
    rows.reverse();
    return { success: true, rows: rows };
  } catch(err) {
    return { success: false, error: err.message, rows: [] };
  }
}

function updatePaymentStatus(ref, status) {
  try {
    var sheet   = getOrCreateSheet(SHEET_NAME, []);
    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    var rC      = headers.indexOf("Ref");
    var pC      = headers.indexOf("Payment Status");
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][rC]) === String(ref)) {
        sheet.getRange(i + 1, pC + 1).setValue(status);
        logActivity("PAYMENT_UPDATE", ref + " -> " + status);
        return { success: true };
      }
    }
    return { success: false, error: "Ref not found" };
  } catch(err) { return { success: false, error: err.message }; }
}

function updateBookingStatus(ref, status) {
  try {
    var sheet   = getOrCreateSheet(SHEET_NAME, []);
    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    var rC      = headers.indexOf("Ref");
    var sC      = headers.indexOf("Status");
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][rC]) === String(ref)) {
        sheet.getRange(i + 1, sC + 1).setValue(status);
        logActivity("STATUS_UPDATE", ref + " -> " + status);
        return { success: true };
      }
    }
    return { success: false, error: "Ref not found" };
  } catch(err) { return { success: false, error: err.message }; }
}

function deleteBooking(ref) {
  try {
    var sheet   = getOrCreateSheet(SHEET_NAME, []);
    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    var rC      = headers.indexOf("Ref");
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][rC]) === String(ref)) {
        sheet.deleteRow(i + 1);
        logActivity("DELETE", ref);
        return { success: true };
      }
    }
    return { success: false, error: "Ref not found" };
  } catch(err) { return { success: false, error: err.message }; }
}

function getDashboardStats() {
  try {
    var result = getBookings();
    if (!result.success) return { success: false, error: result.error };
    var rows    = result.rows;
    var today   = todayStr();
    var totalRevenue = 0, pendingCount = 0, todayCount = 0, completedCount = 0;
    var byService = {}, byCarType = {};
    for (var i = 0; i < rows.length; i++) {
      var r     = rows[i];
      var price = parseFloat(r["Price (\u20B9)"] || r["Price"] || 0);
      var pay   = String(r["Payment Status"] || "Pending");
      var st    = String(r["Status"] || "");
      var dt    = String(r["Date"] || "");
      var svc   = String(r["Service"] || "Other");
      var ct    = String(r["Car Type"] || "Other");
      if (pay !== "Pending") totalRevenue += price;
      if (pay === "Pending") pendingCount++;
      if (dt === today)      todayCount++;
      if (st === "Completed") completedCount++;
      byService[svc] = (byService[svc] || 0) + 1;
      byCarType[ct]  = (byCarType[ct]  || 0) + 1;
    }
    return {
      success: true, total: rows.length,
      totalRevenue: totalRevenue, pendingCount: pendingCount,
      todayCount: todayCount, completedCount: completedCount,
      byService: byService, byCarType: byCarType,
      memberStats: getMembershipStats_()
    };
  } catch(err) { return { success: false, error: err.message }; }
}

function sendConfirmationEmail(data, ref) {
  try {
    var adminEmail = Session.getActiveUser().getEmail();
    if (!adminEmail) return;
    MailApp.sendEmail(adminEmail,
      "[Shadow's Detailing] New Booking " + ref + " - " + data.customerName,
      "New booking!\n\nRef: " + ref +
      "\nCustomer: " + data.customerName +
      "\nPhone: " + data.phone +
      "\nCar: " + data.carModel + " (" + data.carType + ") - " + data.regPlate +
      "\nService: " + data.service +
      "\nDate/Time: " + data.date + " at " + data.time +
      "\nPrice: Rs. " + Number(data.price || 0).toLocaleString("en-IN") +
      "\nNotes: " + (data.notes || "-")
    );
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
// MEMBERSHIP — all functions Membership.html calls
// ════════════════════════════════════════════════════════════════

var TIER_CONFIG = [
  { name: "Platinum", min: 40, color: "#00d4ff" },
  { name: "Gold",     min: 20, color: "#f0c040" },
  { name: "Silver",   min: 10, color: "#c0c0c0" },
  { name: "Bronze",   min: 1,  color: "#cd7f32" }
];

function getTierName_(total) {
  for (var i = 0; i < TIER_CONFIG.length; i++) {
    if (Number(total) >= TIER_CONFIG[i].min) return TIER_CONFIG[i].name;
  }
  return "None";
}

// Called by Membership.html — Check Membership tab
function checkMembership(vehicleNo) {
  try {
    if (!vehicleNo) return { success: false, error: "Vehicle number required" };
    var v     = String(vehicleNo).trim().toUpperCase().replace(/\s+/g, "");
    var sheet = getOrCreateSheet(MEMBERS_SHEET, [
      "Vehicle No", "Name", "Phone", "Registered On",
      "Total Washes", "This Month", "Last Wash", "Tier"
    ]);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, found: false };
    var h  = data[0];
    var vC = h.indexOf("Vehicle No");
    if (vC < 0) return { success: false, error: "Sheet structure error" };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][vC]).trim().toUpperCase().replace(/\s+/g,"") === v) {
        var obj = {};
        for (var j = 0; j < h.length; j++) obj[String(h[j])] = data[i][j];
        return { success: true, found: true, member: obj, history: getWashHistory_(v, 10) };
      }
    }
    return { success: true, found: false };
  } catch(err) { return { success: false, error: err.message }; }
}

// Called by Membership.html — Register new customer
function registerMember(name, vehicleNo, phone) {
  try {
    if (!vehicleNo) return { success: false, error: "Vehicle number required" };
    var v     = String(vehicleNo).trim().toUpperCase().replace(/\s+/g, "");
    var sheet = getOrCreateSheet(MEMBERS_SHEET, [
      "Vehicle No", "Name", "Phone", "Registered On",
      "Total Washes", "This Month", "Last Wash", "Tier"
    ]);
    var data = sheet.getDataRange().getValues();
    if (data.length > 1) {
      var h  = data[0];
      var vC = h.indexOf("Vehicle No");
      if (vC >= 0) {
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][vC]).trim().toUpperCase().replace(/\s+/g,"") === v) {
            return { success: false, error: "Vehicle " + v + " is already registered." };
          }
        }
      }
    }
    sheet.appendRow([v, name || "-", phone || "-", todayStr(), 0, 0, "-", "None"]);
    sheet.autoResizeColumns(1, 8);
    logActivity("MEMBER_REG", v + " - " + (name || "-"));
    return addWash(v); // record first wash immediately
  } catch(err) { return { success: false, error: err.message }; }
}

// Called by Membership.html — Add a wash
function addWash(vehicleNo) {
  try {
    if (!vehicleNo) return { success: false, error: "Vehicle number required" };
    var v     = String(vehicleNo).trim().toUpperCase().replace(/\s+/g, "");
    var sheet = getOrCreateSheet(MEMBERS_SHEET, [
      "Vehicle No", "Name", "Phone", "Registered On",
      "Total Washes", "This Month", "Last Wash", "Tier"
    ]);
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: false, error: "No members found. Register first." };
    var h   = data[0];
    var vC  = h.indexOf("Vehicle No");
    var twC = h.indexOf("Total Washes");
    var tmC = h.indexOf("This Month");
    var lwC = h.indexOf("Last Wash");
    var nC  = h.indexOf("Name");
    var tC  = h.indexOf("Tier");
    if (vC < 0 || twC < 0) return { success: false, error: "Members sheet structure error" };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][vC]).trim().toUpperCase().replace(/\s+/g,"") !== v) continue;
      var nowDate     = todayStr();
      var nowMonth    = thisMonthStr();
      var lastWash    = String(data[i][lwC] || "");
      var sameMonth   = lastWash.length >= 7 && lastWash.slice(0,7) === nowMonth;
      var newThisMonth = sameMonth ? (Number(data[i][tmC]) || 0) + 1 : 1;
      var newTotal     = (Number(data[i][twC]) || 0) + 1;
      var newTier      = getTierName_(newTotal);
      var memberName   = String(data[i][nC] || "-");
      sheet.getRange(i+1, twC+1).setValue(newTotal);
      if (tmC >= 0) sheet.getRange(i+1, tmC+1).setValue(newThisMonth);
      if (lwC >= 0) sheet.getRange(i+1, lwC+1).setValue(nowDate);
      if (tC  >= 0) sheet.getRange(i+1, tC +1).setValue(newTier);
      var wlog = getOrCreateSheet(WASH_LOG, ["Timestamp","Vehicle No","Name","Wash #","This Month"]);
      wlog.appendRow([nowStr(), v, memberName, newTotal, newThisMonth]);
      logActivity("ADD_WASH", v + " total=" + newTotal + " tier=" + newTier);
      return {
        success: true, vehicle: v, name: memberName,
        total: newTotal, thisMonth: newThisMonth,
        tier: newTier, lastWash: nowDate
      };
    }
    return { success: false, error: "Vehicle " + v + " not found. Register first." };
  } catch(err) { return { success: false, error: err.message }; }
}

// Called by Membership.html — Load all members table
function getAllMembers() {
  try {
    var sheet = getOrCreateSheet(MEMBERS_SHEET, []);
    var data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, rows: [] };
    var h    = data[0];
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < h.length; j++) obj[String(h[j])] = data[i][j];
      rows.push(obj);
    }
    return { success: true, rows: rows };
  } catch(err) { return { success: false, error: err.message, rows: [] }; }
}

function getWashHistory_(vehicleNo, limit) {
  try {
    var v     = String(vehicleNo).trim().toUpperCase().replace(/\s+/g,"");
    var sheet = getOrCreateSheet(WASH_LOG, ["Timestamp","Vehicle No","Name","Wash #","This Month"]);
    var data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    var h  = data[0];
    var vC = h.indexOf("Vehicle No");
    if (vC < 0) return [];
    var out = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][vC]).trim().toUpperCase().replace(/\s+/g,"") === v) {
        var obj = {};
        for (var j = 0; j < h.length; j++) obj[String(h[j])] = data[i][j];
        out.push(obj);
      }
    }
    out.reverse();
    return out.slice(0, limit || 10);
  } catch(e) { return []; }
}

function getMembershipStats_() {
  try {
    var sheet = getOrCreateSheet(MEMBERS_SHEET, []);
    var data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return { total: 0, byTier: {} };
    var h  = data[0];
    var tC = h.indexOf("Tier");
    var byTier = {};
    for (var i = 1; i < data.length; i++) {
      var tier = tC >= 0 ? String(data[i][tC] || "None") : "None";
      byTier[tier] = (byTier[tier] || 0) + 1;
    }
    return { total: data.length - 1, byTier: byTier };
  } catch(e) { return { total: 0, byTier: {} }; }
}
