//------------------- GLOBAL VAL -------------------//
const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const { gzip } = require('zlib');
const { parse } = require('path');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

//------------------- AUTHORIZATION -------------------//

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
*/

function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}


//------------------- GENERAL API FUNCTIONS  -------------------//

function listFiles(drive) {
  console.log('---------- FILES ----------');
  getList(drive, '');
}

function getList(drive, pageToken) {
  let type = userArg;
  drive.files.list({
    pageToken: pageToken ? pageToken : '',
    fields: 'nextPageToken, files(*)',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const files = res.data.files;
    if (files.length) {
      files.map((file) => {
        if(!file.trashed){
          if(type == 0){
            let json = '{"id" :"'+file.id+ '","name":"' + file.name +'"}';
            console.log(JSON.parse(json));
          }else if(type == 1) getFile(drive, file.id);
          else console.log(file);
        }
      })
      if(res.data.nextPageToken) getList(drive, res.data.nextPageToken);
    } else {
      console.log('No files found.');
    }
  });
}

function searchfile(drive, pageToken, calltype = 0){
  return new Promise((resolve, reject) => {
    drive.files.list({
      q: `name='${userArg}' and trashed= false`,
      pageToken: pageToken ? pageToken : '',
      fields: 'nextPageToken, files(*)',
    }, (err, res) => {
      if (err) return console.log('The API returned an error: ' + err);
      const files = res.data.files;
      if (files.length) {
        if(calltype == 1) resolve(true);
        files.map((file) => {
          if (calltype == 0) getFile(drive, file.id);
        })
        if(res.data.nextPageToken) searchfile(drive, res.data.nextPageToken, calltype);
      } else {
        console.log('No files found.');
        resolve(false);
      }
    });
  });
}

function getFileInfo(drive){
  console.log('---------- FILE INFO ----------');
  if(inputype == 'id') getFile(drive);
  else searchfile(drive,'',0);
}

function getFile(drive, file_id = userArg){
  drive.files.get({ fileId: file_id, 
    fields:'name, id, ownedByMe, mimeType, webViewLink, viewedByMeTime, createdTime, modifiedTime, modifiedByMeTime, shared,trashed'
  }, (err,res) => {
    if (err) return console.log('The API returned an error: ' + err);
    console.log(res.data);
  })
}

async function uploadFile(drive){
  let res = await searchfile(drive, '', 1);
  if (res) console.log(`ERROR: Uploading failed, a file with this name already exists.`);
  else upload(drive);
}

function upload(drive){
  var path = "/";
  var fileMetadata = {
    'name': userArg
  };
  var media = {
    name: userArg,
    body: fs.createReadStream(`${path}/${userArg}`)
  };
  drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  }, function (err, file) {
    if (err) console.error(err);
    else console.log(`File ['${userArg}'] uploaded successfully`);
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function Manager (auth){
  const drive = google.drive({version: 'v3', auth});
  if (userFunc == "listFiles") listFiles(drive);
  else if (userFunc == "getFileInfo") getFileInfo(drive);
  else if (userFunc == "uploadFile") uploadFile(drive);
}

//------------------- MAIN  -------------------//

var myArgs = process.argv.slice(2);

if (myArgs[0] == '-h'){
  console.log(`
  USER MANUAL
  $ node . {arg1} {arg2}

  (func1) -> ListFiles: List all the files from your user
  USE: node . listFiles {type}
  {type}: How many info will be displayed for your file [from 0(id, name) to 2(full info)]
  EX: node . listFiles 1
  
  (func2) -> getFileInfo: Get the file for the id or name
  USE: node. getFileInfo name={nameofthefile}
  USE: node. getFileInfo id={idofthefile}
   
  (func3) -> uploadFile: Upload the file x
  USE: node. uploadFile: image.jpg

  `);
} else if(myArgs.length == 2 && (myArgs[0] == "listFiles" || myArgs[0] == "getFileInfo" || myArgs[0] == "uploadFile")){
  var userFunc = myArgs[0];
  if(userFunc == "getFileInfo"){
    var inputype = myArgs[1].split("=")[0];
    var userArg = myArgs[1].split("=")[1];
    if(inputype != "id" && inputype != "name"){
      console.log("Failed to load...Please use '-h' to get the USER MANUAL");
      return -1;
    }
  }else var userArg = myArgs[1];
  
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Drive API.
    authorize(JSON.parse(content), Manager);
  });
} else {
  console.log("Failed to load...Please use '-h' to get the USER MANUAL")
}
