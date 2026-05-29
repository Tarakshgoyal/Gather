import net from "node:net";
import tls from "node:tls";

type SocketLike = net.Socket | tls.TLSSocket;

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!host || !user || !pass) throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS are required.");
  return { host, port, user, pass };
}

function readResponse(socket: SocketLike) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP response timed out."));
    }, 15_000);
    function cleanup() {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
    }
    function onError(error: Error) {
      cleanup();
      reject(error);
    }
    function onData(chunk: Buffer) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    }
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function sendCommand(socket: SocketLike, command: string, expected: number[]) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) throw new Error(`SMTP command failed: ${response.trim()}`);
  return response;
}

function escapeAddress(address: string) {
  return address.replace(/[<>\r\n]/g, "");
}

function normalizeData(input: string) {
  return input.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

export async function sendVerificationEmail(to: string, name: string, verificationUrl: string) {
  const config = smtpConfig();
  let socket: SocketLike = net.connect(config.port, config.host);

  await readResponse(socket);
  await sendCommand(socket, `EHLO ${config.host}`, [250]);
  await sendCommand(socket, "STARTTLS", [220]);

  socket = tls.connect({
    socket,
    servername: config.host,
    rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED
      ? process.env.SMTP_REJECT_UNAUTHORIZED !== "false"
      : process.env.NODE_ENV === "production",
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  await sendCommand(socket, `EHLO ${config.host}`, [250]);
  await sendCommand(socket, `AUTH PLAIN ${Buffer.from(`\0${config.user}\0${config.pass}`).toString("base64")}`, [235]);
  await sendCommand(socket, `MAIL FROM:<${escapeAddress(config.user)}>`, [250]);
  await sendCommand(socket, `RCPT TO:<${escapeAddress(to)}>`, [250, 251]);
  await sendCommand(socket, "DATA", [354]);

  const subject = "Verify your Gather office email";
  const text = [
    `Hi ${name},`,
    "",
    "Verify your email to enter the Gather office:",
    verificationUrl,
    "",
    "This link expires in 30 minutes.",
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#20242a;line-height:1.5">
      <h2>Verify your Gather office email</h2>
      <p>Hi ${name.replace(/[<>&]/g, "")},</p>
      <p>Verify your email to enter the office.</p>
      <p><a href="${verificationUrl}" style="display:inline-block;background:#4e55ec;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Verify email</a></p>
      <p style="color:#67707a">This link expires in 30 minutes.</p>
    </div>
  `;
  const message = [
    `From: Gather Office <${config.user}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: multipart/alternative; boundary=gather-auth-boundary",
    "",
    "--gather-auth-boundary",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
    "--gather-auth-boundary",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
    "--gather-auth-boundary--",
  ].join("\r\n");

  socket.write(`${normalizeData(message)}\r\n.\r\n`);
  const dataResponse = await readResponse(socket);
  if (Number(dataResponse.slice(0, 3)) !== 250) throw new Error(`SMTP message failed: ${dataResponse.trim()}`);
  await sendCommand(socket, "QUIT", [221]).catch(() => undefined);
  socket.end();
}
