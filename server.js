require("dotenv").config();
const express = require("express");
const compression = require("compression");
const nodemailer = require("nodemailer");
const https = require("https");
const fs = require("fs");
const config = require("./config.json");

const port = config.port;
const smtp = config.smtp;
const smtpPort = config.smtpPort;
const keyFile = config.key;
const certFile = config.cert;
const hskey = fs.readFileSync(keyFile);
const hscert = fs.readFileSync(certFile);
const mailOptionsBase = config.email;
const permissionsArr = config.permissions;

const recipient = process.env.REQUEST_RECIPIENT;

const transporterOptions = {
  host: smtp,
  port: smtpPort,
  secure: false,
};

////////////////////////////////
//////////server setup//////////
////////////////////////////////

const app = express();

let options = {
  key: hskey,
  cert: hscert,
};

const server = https.createServer(options, app).listen(port, (err) => {
  if (err) {
    console.error(error);
  } else {
    console.log("Server listening at port " + port);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//compress all HTTP responses
app.use(compression());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Range, Content-Range, Cache-Control"
  );
  //pass to next layer
  next();
});

/////////////////////////////
///////signal handling///////
/////////////////////////////

const signals = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGTERM: 15,
};

function shutdown(code) {
  //stops new connections and completes existing ones before closing
  server.close(() => {
    console.log(`Server shutdown.`);
    process.exit(code);
  });
}

for (let signal in signals) {
  let signalVal = signals[signal];
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down server...`);
    shutdown(128 + signalVal);
  });
}

/////////////////////////////
/////////////////////////////

async function sendEmail(transporterOptions, mailOptions) {
  combinedMailOptions = Object.assign({}, mailOptionsBase, mailOptions);

  let transporter = nodemailer.createTransport(transporterOptions);

  //have to be on uh netork
  return transporter
    .sendMail(combinedMailOptions)
    .then((info) => {
      //should parse response for success (should start with 250)
      return {
        success: true,
        result: info,
        error: null,
      };
    })
    .catch((error) => {
      return {
        success: false,
        result: null,
        error: error,
      };
    });
}

app.post("/requests", async (req, res) => {
  // const permission = "db";
  let message = "Request successful!";

  req.body.status = "PENDING";

  req.body.permissions = [
    { username: permissionsArr[0], permissions: "ALL" },
    { username: permissionsArr[1], permissions: "ALL" },
    { username: permissionsArr[2], permissions: "ALL" },
    { username: permissionsArr[3], permissions: "ALL" },
  ];

  const dataDump = {
    name: "TEST_Micro_Requests",
    value: req.body,
  };

  const data = JSON.stringify(dataDump);

  const options = {
    hostname: "ikeauth.its.hawaii.edu",
    // port: 8080,
    path: "/meta/v2/data/",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
      Authorization: "Bearer f8ce8c61c9b604cd569a9e98f25e343",
    },
  };

  const newreq = https.request(options, (res) => {
    console.log(`statusCode: ${res.statusCode}`);

    res.on("data", (d) => {
      process.stdout.write(d);
    });
  });

  newreq.on("error", (error) => {
    console.error(error);
  });

  newreq.write(data);
  newreq.end();

  let mailOptions = {
    to: recipient,
    text:
      "New Water Sample Request from " +
      req.body.firstName +
      " " +
      req.body.lastName,
    html:
      "<p>" +
      "New Water Sample Request from " +
      req.body.firstName +
      " " +
      req.body.lastName +
      ". <br/><br/>" +
      "Please click this " +
      "<a href='https://wwww.ikewaiadmin.com'>" +
      "link " +
      "</a>" +
      "for more information." +
      "</p>",
  };

  let emailStatus = await sendEmail(transporterOptions, mailOptions);

  //if email send failed throw error for logging
  if (!emailStatus.success) {
    console.log(emailStatus, "error error >");
    message += " Email notification error.";
  }

  res.status(201).send({ message: message });
});

app.get("/", async (req, res) => {
  res.send("sanity");
});
