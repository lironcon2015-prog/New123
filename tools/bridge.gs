/**
 * bridge.gs — גשר Apps Script ל"התיק המשפחתי".
 *
 * למה הוא קיים: OAuth בדפדפן מחייב טוקן שפג, ולכן התחברות חוזרת. הגשר רץ
 * **בחשבון הגוגל שלך** ואינו צריך טוקן מהדפדפן כלל — מדביקים כתובת וסוד
 * פעם אחת, ומאז אין פופאפ ואין התחברות. הדפוס הגיע מנאביגו (Q7).
 *
 * מה שונה כאן מנאביגו, ובכוונה:
 *
 *   1. **הגשר נוגע בתיקייה אחת בלבד.** אצל נאביגו `download` מקבל מזהה
 *      קובץ ומחזיר אותו — כלומר מי שמחזיק את הכתובת והסוד יכול לקרוא
 *      **כל** קובץ בדרייב. כאן כל קריאה מאמתת שהקובץ יושב בתוך `DocVault`,
 *      ומחוצה לה הגשר מסרב. זה מצמצם את הנזק מדליפת הסוד מ"כל הדרייב"
 *      ל"התיקייה של האפליקציה".
 *   2. **אין יצירת קבצים מחוץ לתיקייה**, ואין מחיקה בכלל.
 *
 * ⚠️ הכתובת והסוד הם **צמד גישה**. מי שמחזיק את שניהם יכול לקרוא ולכתוב
 *    בתיקיית DocVault שלך. אל תשלח אותם בערוץ פתוח, ואם דלפו — פרוס מחדש
 *    עם סוד חדש (זה מבטל את הישן מיידית).
 *
 * ---------- התקנה, פעם אחת ----------
 *
 *   1. script.google.com → New project → הדבק את הקובץ הזה במקום התוכן.
 *   2. שנה את SECRET למחרוזת אקראית משלך — 16 תווים לפחות, ורצוי 32.
 *      הכתובת חשופה ("Anyone"), ולכן הסוד הוא כל ההגנה. סוד קצר נשבר
 *      בניחוש, ולכן הגשר מסרב לרוץ איתו.
 *   3. Deploy → New deployment → סוג: Web app.
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      ("Anyone" נדרש כדי שהדפדפן יוכל לפנות בלי התחברות — הסוד הוא מה
 *       שמגן, ולכן הוא חייב להיות אקראי ולא לנחש.)
 *   4. אשר את ההרשאות במסך שגוגל מציג.
 *   5. העתק את כתובת ה-Web app (מסתיימת ב-/exec) ואת הסוד להגדרות
 *      האפליקציה, תחת "גיבוי לדרייב".
 *
 * אחרי כל שינוי בקובץ: Deploy → Manage deployments → עריכה → New version.
 *
 * ---------- אם הפריסה נכשלת ----------
 *
 * דף "מצטערים, לא ניתן לפתוח את הקובץ כרגע" עם `authuser=<מספר>` בכתובת
 * פירושו **כמה חשבונות גוגל מחוברים באותו דפדפן**. Apps Script פונה לחשבון
 * הלא נכון, וזה אינו קשור לסקריפט ואינו נפתר בפריסה חוזרת. הפתרון: חלון
 * פרטי עם חשבון אחד בלבד, או החלפת `authuser=3` ב-`authuser=0` בכתובת.
 *
 * בחשבון Workspace ייתכן שמדיניות המנהל חוסמת "Who has access: Anyone" —
 * אז יש להקים את הגשר בחשבון פרטי. והכתובת חייבת להסתיים ב-/exec; כתובת
 * /dev היא הפריסה הזמנית, והיא דורשת התחברות.
 */

/** שנה אותי. מחרוזת אקראית: 16 תווים זה המינימום שהגשר מקבל, 32 זה המומלץ. */
var SECRET = 'שנה-אותי-למחרוזת-אקראית-ארוכה';

var ROOT_NAME = 'DocVault';
var FILES_NAME = 'files';
var DB_NAME = 'docvault-db.json';
var MARKER = 'family-vault-root';
var MIN_SECRET = 16;

/* ---------- הכניסה ---------- */

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    /* שתי הודעות ולא אחת: "לא הוגדר" ו"קצר מדי" הן תקלות שונות, והודעה
       אחת לשתיהן שולחת את מי שהגדיר סוד קצר לחפש במקום הלא נכון. */
    if (!SECRET) throw new Error('SECRET לא הוגדר בגשר');
    if (SECRET.length < MIN_SECRET) {
      throw new Error('הסוד בגשר קצר מדי — ' + SECRET.length + ' תווים, ' +
                      'נדרשים ' + MIN_SECRET + ' לפחות');
    }
    if (String(req.token || '') !== SECRET) throw new Error('סוד שגוי');
    return _json({ ok: true, result: _handle(req) });
  } catch (err) {
    return _json({ ok: false, error: String((err && err.message) || err) });
  }
}

function _handle(req) {
  switch (req.action) {
    case 'ping':     return { name: _root().getName() };
    case 'getDb':    return _getDb();
    case 'putDb':    return _putDb(req);
    case 'upload':   return _upload(req);
    case 'download': return _download(req);
    default: throw new Error('פעולה לא מוכרת: ' + req.action);
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- התיקייה ----------
   מסומנת ב-description, ולכן היא נמצאת מחדש גם אם שום מזהה לא נשמר.
   זה הרעיון שנאביגו המליצה עליו: אל תסמוך על id שמור, סמן את התיקייה. */

function _root() {
  var it = DriveApp.getFoldersByName(ROOT_NAME);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed() && f.getDescription() === MARKER) return f;
  }
  var created = DriveApp.createFolder(ROOT_NAME);
  created.setDescription(MARKER);
  return created;
}

function _filesFolder() {
  var root = _root();
  var it = root.getFoldersByName(FILES_NAME);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return root.createFolder(FILES_NAME);
}

/* קובץ נחשב שלנו רק אם הוא יושב בתוך DocVault או בתת-התיקייה שלה.
   בלי הבדיקה הזאת, מזהה קובץ שרירותי היה הופך את הסוד למפתח לכל הדרייב. */
function _inVault(file) {
  var rootId = _root().getId();
  var parents = file.getParents();
  while (parents.hasNext()) {
    var p = parents.next();
    if (p.getId() === rootId) return true;
    var gp = p.getParents();
    while (gp.hasNext()) {
      if (gp.next().getId() === rootId) return true;
    }
  }
  return false;
}

/* ---------- db.json ---------- */

function _dbFile() {
  var it = _root().getFilesByName(DB_NAME);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return null;
}

function _getDb() {
  var f = _dbFile();
  if (!f) return { db: null };
  return { db: JSON.parse(f.getBlob().getDataAsString('UTF-8')) };
}

function _putDb(req) {
  var text = JSON.stringify(req.db || {});
  var f = _dbFile();
  if (f) {
    f.setContent(text);
    return { id: f.getId() };
  }
  var made = _root().createFile(DB_NAME, text, 'application/json');
  return { id: made.getId() };
}

/* ---------- blobs ---------- */

function _upload(req) {
  var name = String(req.docId || 'doc') + '__' + String(req.name || 'file');
  var blob = Utilities.newBlob(
    Utilities.base64Decode(String(req.data || '')),
    String(req.mime || 'application/octet-stream'),
    name);
  var file = _filesFolder().createFile(blob);
  return { fileId: file.getId() };
}

function _download(req) {
  var file = DriveApp.getFileById(String(req.fileId || ''));
  if (!_inVault(file)) throw new Error('הקובץ אינו בתיקיית DocVault');
  var blob = file.getBlob();
  return {
    name: file.getName(),
    mime: blob.getContentType(),
    data: Utilities.base64Encode(blob.getBytes())
  };
}
