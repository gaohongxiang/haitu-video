import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { getStorageRoots } from "../storagePaths.js";

export type AuthEmailOtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

export interface AuthEmailOtpMessage {
  email: string;
  otp: string;
  type: AuthEmailOtpType;
}

export async function sendAuthEmailOtp(input: {
  dataDir: string;
  env?: NodeJS.ProcessEnv;
  message: AuthEmailOtpMessage;
}): Promise<void> {
  await appendAuthEmailOutbox(input.dataDir, input.message);
  if (input.env?.RESEND_API_KEY && input.env.HAITU_AUTH_EMAIL_FROM) {
    await sendResendEmail({
      env: input.env,
      message: input.message
    });
  }
}

async function appendAuthEmailOutbox(dataDir: string, message: AuthEmailOtpMessage): Promise<void> {
  const systemDir = getStorageRoots(dataDir).systemDir;
  await mkdir(systemDir, { recursive: true });
  await appendFile(
    join(systemDir, "auth-email-outbox.jsonl"),
    `${JSON.stringify({
      ...message,
      createdAt: new Date().toISOString()
    })}\n`,
    "utf8"
  );
}

async function sendResendEmail(input: {
  env: NodeJS.ProcessEnv;
  message: AuthEmailOtpMessage;
}): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.env.RESEND_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: input.env.HAITU_AUTH_EMAIL_FROM,
      to: input.message.email,
      subject: subjectForOtp(input.message.type),
      text: textForOtp(input.message)
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send auth email: ${response.status} ${body}`);
  }
}

function subjectForOtp(type: AuthEmailOtpType): string {
  if (type === "forget-password") {
    return "Haitu 重置密码验证码";
  }
  return "Haitu 验证码";
}

function textForOtp(message: AuthEmailOtpMessage): string {
  const purpose = message.type === "forget-password" ? "重置密码" : "验证邮箱";
  return [
    `你的 Haitu ${purpose}验证码是：${message.otp}`,
    "",
    "验证码 5 分钟内有效。如果不是你本人操作，可以忽略这封邮件。"
  ].join("\n");
}
