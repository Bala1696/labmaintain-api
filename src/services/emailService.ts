import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export const inviteLink = (token: string) =>
  `${(process.env.CLIENT_URL || "labmaintain://register").replace(/\/$/, "")}/${token}`;

export async function sendInvitationEmail(p: { to: string; role: string; departmentName?: string; token: string }) {
  const link = inviteLink(p.token);
  if (!process.env.SMTP_USER) {
    console.log(`[email] SMTP not configured. Invitation link for ${p.to}: ${link}`);
    return;
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;">
      <h2 style="color:#1e3a8a;">You're invited to LabMaintain</h2>
      <p>You have been invited as <strong>${p.role.toUpperCase()}</strong>${
        p.departmentName ? ` in <strong>${p.departmentName}</strong>` : ""}.</p>
      <p>This link is valid for 48 hours.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
         text-decoration:none;border-radius:6px;">Accept Invitation</a>
      <p style="color:#666;font-size:12px;margin-top:24px;">Or paste this into the app: ${link}</p>
    </div>`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || '"LabMaintain System" <noreply@labmaintain.edu>',
    to: p.to, subject: "LabMaintain — Staff Invitation", html,
  });
}
