/**
 * Eclipse Moment — real-time lead feed.
 *
 * Paste this into the leads spreadsheet: Extensions -> Apps Script, replace
 * everything, Save, then Deploy -> New deployment -> Web app
 *   Execute as:  Me
 *   Who has access:  Anyone
 * Copy the /exec URL it gives you and send it to Claude.
 *
 * Writes to a tab called "Live". Leave the IMPORTDATA tab alone: that formula
 * owns its range and a script cannot write into it.
 */

var SHEET_ID = '1Y_XFe9tx2hvY6GWGjkgCvdamLFovNv69k88AA-llFiE';
var SHEET_NAME = 'Live';
var SECRET = 'RsiOcrQ3S9QOmiswKbZLA9MvDJKAth_d';
var HEAD = ['at', 'email', 'intent', 'source', 'country', 'submits', 'lastAt', 'ref'];

/* Opened by id rather than "the active spreadsheet", so this works whether the
   project is attached to the sheet or standalone. A web app has no active
   spreadsheet in the usual sense. */
function book() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function doPost(e) {
  var out = function (o) {
    return ContentService.createTextOutput(JSON.stringify(o))
      .setMimeType(ContentService.MimeType.JSON);
  };

  var lead;
  try {
    lead = JSON.parse(e.postData.contents);
  } catch (err) {
    return out({ ok: false, error: 'bad json' });
  }

  /* The web app has to accept anonymous POSTs to be reachable, so the shared
     secret is what actually keeps strangers out of the sheet. */
  if (lead.secret !== SECRET) return out({ ok: false, error: 'forbidden' });
  if (!lead.email) return out({ ok: false, error: 'no email' });

  /* One writer at a time: two people reserving in the same second would
     otherwise read the same row count and write over each other. */
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = book();
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
      sh.appendRow(HEAD);
      sh.setFrozenRows(1);
    }
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEAD);
      sh.setFrozenRows(1);
    }

    var row = HEAD.map(function (h) {
      var v = lead[h] == null ? '' : String(lead[h]);
      /* A leading =, +, - or @ would be read as a formula. */
      return /^[=+\-@]/.test(v) ? "'" + v : v;
    });

    /* Upsert, so a repeat submit updates that person's row instead of adding a
       second one. Matches how the worker stores them. */
    var found = 0;
    var last = sh.getLastRow();
    if (last > 1) {
      var emails = sh.getRange(2, 2, last - 1, 1).getValues();
      for (var i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).toLowerCase() === String(lead.email).toLowerCase()) {
          found = i + 2;
          break;
        }
      }
    }
    if (found) {
      sh.getRange(found, 1, 1, HEAD.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
    return out({ ok: true, row: found || sh.getLastRow() });
  } finally {
    lock.releaseLock();
  }
}

/* Lets you confirm the deployment is reachable in a browser. */
function doGet() {
  return ContentService.createTextOutput('eclipse lead feed: ready');
}
