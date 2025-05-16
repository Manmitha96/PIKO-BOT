const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { upload } = require("./mega");

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);

    try {
      let RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (update) => {
        const { qr, connection, lastDisconnect } = update;

        if (qr && !res.headersSent) {
          // Send QR code to client to scan on WhatsApp
          return res.send({ qr });
        }

        if (connection === "open") {
          // Connection established, upload session & send session ID message

          try {
            await delay(10000); // wait to ensure stable connection

            const auth_path = "./session/";
            const user_jid = jidNormalizedUser(RobinPairWeb.user.id);

            function randomMegaId(length = 6, numberLength = 4) {
              const characters =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
              let result = "";
              for (let i = 0; i < length; i++) {
                result += characters.charAt(
                  Math.floor(Math.random() * characters.length)
                );
              }
              const number = Math.floor(
                Math.random() * Math.pow(10, numberLength)
              );
              return `${result}${number}`;
            }

            // Upload creds.json to MEGA and get URL
            const mega_url = await upload(
              fs.createReadStream(auth_path + "creds.json"),
              `${randomMegaId()}.json`
            );

            // Create the session ID string by trimming mega URL
            const string_session = mega_url.replace(
              "https://mega.nz/file/",
              ""
            );

            const sid = `*PIKO-BOT [THE POWERFUL WA BOT]*\n\n👉 ${string_session} 👈\n\n*This is your Session ID, copy this id and paste into config.js file*\n\n*You can ask any question using this link*`;
            const mg = `🛑 *Do not share this code with anyone* 🛑`;

            // Send session ID as image caption & text messages to your WhatsApp number
            await RobinPairWeb.sendMessage(user_jid, {
              image: {
                url: "https://media-hosting.imagekit.io/263e0ddbce7248c6/IMG-20250427-WA0145.jpg?Expires=1841733535&Key-Pair-Id=K2ZIVPTIP2VGHC&Signature=iH4pD50tcRzt5VbAA7h7PasMa8VbU3v6InOPXuolTrwbT4jbzQRnlcWFMSDrFANeJMVF0n5~AedF5Yz~QEHSKcKTybncR4g1qcN9G2Gp1sP2Qxs8M2A5VXUfNyQXAECF2QtdV2hMKaXyyD0SN8tVzpzX15xpIrqKWOJB0TfqeS9mTwM1cqRXEHMQtNH~34W7xucezuPJvcSXjjQGaRnqn6HIFibTEbvrzR40F4ItjS7IisAj83D9SPt9h33i9N6ahyKyHV0tQZOHERvoYnVSwk0ERIKyldddy43HjXrKv8BG~V6p3FTXqB8Q9s04v~Ob~Yk2iqvHVv3XCf~BDvGMdg__",
              },
              caption: sid,
            });

            await RobinPairWeb.sendMessage(user_jid, { text: string_session });
            await RobinPairWeb.sendMessage(user_jid, { text: mg });

            // After sending session ID, respond to HTTP request (if not already done)
            if (!res.headersSent) {
              return res.send({ status: "connected", session_id: string_session });
            }

            // Optional: Clean session files after sending session ID
            removeFile("./session");
          } catch (e) {
            console.error("Error while sending session ID:", e);
            exec("pm2 restart prabath");
          }
        }

        if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          // Attempt to reconnect
          await delay(10000);
          RobinPair();
        }
      });
    } catch (err) {
      console.error("Service error:", err);
      exec("pm2 restart Robin-md");
      console.log("service restarted");
      RobinPair();
      removeFile("./session");

      if (!res.headersSent) {
        res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await RobinPair();
});

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
  exec("pm2 restart Robin");
});

module.exports = router;
