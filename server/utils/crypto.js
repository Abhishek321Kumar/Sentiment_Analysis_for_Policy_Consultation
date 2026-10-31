import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Unambiguous alphabet (no 0, O, 1, I, L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return result;
}

export function generateOrgCode() {
  return generateCode(10);
}

export function generateCampaignCode() {
  return generateCode(8);
}

export function generateInvitationToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function generateOtp() {
  // 6-digit numeric OTP
  const num = crypto.randomInt(100000, 999999);
  return num.toString();
}

export async function hashPassword(plainText) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function comparePassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

export async function hashOtp(otp) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
}

export async function compareOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}

export default {
  generateCode,
  generateOrgCode,
  generateCampaignCode,
  generateInvitationToken,
  generateOtp,
  hashPassword,
  comparePassword,
  hashOtp,
  compareOtp,
};
