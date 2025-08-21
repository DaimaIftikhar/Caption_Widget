
function doGet(e) {
  ensureSheets_();
  const params = e.parameter || {};
  if (params.action === "list" && params.widget) {
    const items = listCaptions_(params.widget);
    return json_( { items: items } );
  }
  return json_( { items: [] } );
}

function doPost(e) {
  ensureSheets_();
  const body = JSON.parse(e.postData.contents || "{}");

  if (body.action === "submit") {
    // Reject duplicate (same widget+text within last 24h)
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const cap = getSheet_("Captions");
    const rows = cap.getDataRange().getValues();
    // rows[0] are headers: widget | id | text | votes | ts | by
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (r[0] === body.widget && String(r[2]).trim() === String(body.text).trim()) {
        var ts = normalizeTs_(r[4]);
        if (now - ts < dayMs) {
          return json_( { error: "Duplicate" } );
        }
      }
    }
    var id = Utilities.getUuid();
    cap.appendRow([body.widget, id, body.text, 0, now, body.by || "anon"]);
    return json_({ widget: body.widget, id: id, text: body.text, votes: 0, ts: now, by: body.by || "anon" });
  }

  if (body.action === "vote") {
    // if not already cast
    var votesSheet = getSheet_("Votes");
    var vr = votesSheet.getDataRange().getValues(); // widget | captionId | voter | ts
    for (var j = 1; j < vr.length; j++) {
      var v = vr[j];
      if (v[0] === body.widget && v[1] === body.id && v[2] === body.voter) {
        return json_({ ok: false, error: "Already voted" });
      }
    }
    votesSheet.appendRow([body.widget, body.id, body.voter, Date.now()]);
    // increment in Captions
    var cap = getSheet_("Captions");
    var cr = cap.getDataRange().getValues();
    for (var k = 1; k < cr.length; k++) {
      if (cr[k][0] === body.widget && cr[k][1] === body.id) {
        var current = Number(cr[k][3] || 0) + 1;
        cap.getRange(k + 1, 4).setValue(current); // col 4 = votes
        return json_({ ok: true, votes: current });
      }
    }
    return json_({ ok: false, error: "Not found" });
  }

  return json_({ error: "Bad request" });
}

// ---------- Helpers ----------
function ensureSheets_() {
  var cap = getSheet_("Captions");
  var votes = getSheet_("Votes");
  // Ensure headers if empty
  if (cap.getLastRow() === 0) cap.appendRow(["widget","id","text","votes","ts","by"]);
  if (votes.getLastRow() === 0) votes.appendRow(["widget","captionId","voter","ts"]);
}

function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function listCaptions_(widget) {
  var cap = getSheet_("Captions");
  var rows = cap.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (r[0] === widget) {
      out.push({
        widget: r[0],
        id: r[1],
        text: r[2],
        votes: Number(r[3] || 0),
        ts: normalizeTs_(r[4]),
        by: r[5] || "anon"
      });
    }
  }
  return out;
}

function normalizeTs_(val) {
  if (typeof val === "number") return val;
  if (Object.prototype.toString.call(val) === "[object Date]") return val.getTime();
  return Number(val) || 0;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
