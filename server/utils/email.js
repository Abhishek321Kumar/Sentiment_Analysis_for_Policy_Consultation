import nodemailer from 'nodemailer';
import db from '../db.js';

let transporter = null;

function getTransporter() {
  if (!transporter && process.env.EMAIL_MODE === 'smtp') {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export function buildEmailContent(template, data) {
  const firstName = data.firstName || 'there';
  let subject = '';
  let body = '';

  switch (template) {
    case 'OTP':
      subject = 'Your PotentPolicy Verification Code';
      body = `Hello ${firstName},\n\nYour 6-digit verification code is:\n\n${data.otp}\n\nThis code will expire in 10 minutes. If you did not request this verification, please ignore this email.\n\n— The PotentPolicy Team`;
      break;

    case 'ORG_CODE':
      subject = `Registration Successful: Organisation Code for ${data.orgName}`;
      body = `Hello ${firstName},\n\nCongratulations! Your organisation "${data.orgName}" has been successfully registered on PotentPolicy.\n\nYour confidential Organisation Code is:\n\n${data.orgCode}\n\nKeep this code safe and confidential. Your invited Campaign Managers will need this code and their activation link to set up their accounts under your organisation.\n\nAdministrator Email: ${data.email || 'Your registered email'}\nLogin URL: ${data.loginUrl || 'http://localhost:5173/login'}\n\n— The PotentPolicy Team`;
      break;

    case 'MANAGER_INVITE': {
      const adminPart = data.adminName ? ` by your administrator ${data.adminName}` : '';
      subject = `You have been invited as a Campaign Manager for ${data.orgName}`;
      body = `Hello ${firstName},\n\nYou have been added as a Campaign Manager to the PotentPolicy platform${adminPart} for "${data.orgName}".\n\nPlease find your institutional details and account activation link below:\n\nOrganisation: ${data.orgName}\nOrganisation Code: ${data.orgCode}\nRole: Campaign Manager\nActivation Link: ${data.activationUrl || `http://localhost:5173/activate-manager?token=${data.token}`}\nInvitation Expiry: 7 days\n\nPlease click the activation link above to review your profile and set your secure password to complete your account activation. Once completed, you will be able to log in directly to your Campaign Manager dashboard.\n\n— The PotentPolicy Team`;
      break;
    }

    case 'STAKEHOLDER_ADDED': {
      const adminPart = data.adminName ? ` by your administrator ${data.adminName}` : '';
      subject = `You have been added to Potent policy system${adminPart}`;
      body = `Hello ${firstName},\n\nYou have been added to Potent policy system${adminPart} for "${data.orgName}".\n\nPlease find your stakeholder verification credentials below:\nStakeholder ID: ${data.userId}\nOrganisation Code: ${data.orgCode}\nVerification Link: ${data.verifyUrl || `http://localhost:5173/verify-stakeholder?userId=${encodeURIComponent(data.userId || '')}`}\n\nPlease click the verification link above (your Stakeholder ID will be automatically pre-filled) and enter your Organisation Code to confirm your enrollment as an Active stakeholder. Once submitted, you will receive confirmation that you are successfully registered and can close the tab.\n\nNote: If not confirmed within 4 days, unregistered records will be automatically discarded.\n\n— The PotentPolicy Team`;
      break;
    }

    case 'CAMPAIGN_INVITE':
      subject = `Consultation Invitation: ${data.title}`;
      body = `Hello ${firstName},\n\nYou are invited to share your perspectives in an active consultation campaign: "${data.title}".\n\nCampaign Code: ${data.campaignCode}\nClosing Date: ${data.closingDate}\nParticipation Link: ${data.participateUrl || `http://localhost:5173/participate?code=${data.campaignCode}`}\n\nYour responses are confidential and will help shape upcoming institutional policy.\n\n— The PotentPolicy Team`;
      break;

    case 'PASSWORD_RESET':
      subject = 'Reset Your PotentPolicy Password';
      body = `Hello ${firstName},\n\nWe received a request to reset your password for your PotentPolicy account (${data.email}).\n\nPlease find your password reset credentials and link below:\n\nRole: ${data.roleName || 'Member'}\nReset Link: ${data.resetUrl}\nLink Expiry: 1 hour\n\nPlease click the reset link above or open it in your browser to choose a new, secure password. Once saved, you can log in immediately with your new credentials.\n\nIf you did not make this request, you can safely disregard this email. Your existing password will remain secure and unchanged.\n\n— The PotentPolicy Team`;
      break;

    default:
      subject = data.subject || 'PotentPolicy Notification';
      body = `Hello ${firstName},\n\n${data.message || ''}\n\n— The PotentPolicy Team`;
  }

  return { subject, body };
}

/**
 * Sends an email asynchronously. Email failures NEVER fail the main request.
 */
export async function sendEmail({ to, firstName, template, data = {} }) {
  try {
    const emailData = { ...data, firstName: firstName || data.firstName };
    const { subject, body } = buildEmailContent(template, emailData);
    const emailMode = process.env.EMAIL_MODE || 'capture';

    if (emailMode === 'smtp') {
      const mailer = getTransporter();
      if (mailer) {
        await mailer.sendMail({
          from: process.env.EMAIL_FROM || '"PotentPolicy" <noreply@potentpolicy.com>',
          to,
          subject,
          text: body,
        });
        console.log(`[Email Sent via SMTP] To: ${to} | Subject: ${subject}`);
        return;
      }
    }

    // Default 'capture' mode: save to dev_emails table
    await db.query(
      'INSERT INTO dev_emails (to_email, subject, body, template) VALUES ($1, $2, $3, $4)',
      [to, subject, body, template]
    );
    console.log(`[Email Captured in Outbox] To: ${to} | Subject: ${subject} | Template: ${template}`);
  } catch (err) {
    console.error('[Email Send Error (Ignored)]', err.message);
  }
}

export default {
  sendEmail,
  buildEmailContent,
};
