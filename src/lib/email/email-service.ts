// Email service for sending verification codes and notifications
// In production, integrate with SendGrid, AWS SES, or similar

export class EmailService {
  static async sendVerificationCode(email: string, code: string, userName: string): Promise<void> {
    // In development, log to console
    if (process.env.NODE_ENV === 'development') {

      return;
    }

    // In production, use email service
    // Example with SendGrid:
    // const msg = {
    //   to: email,
    //   from: 'noreply@johnsonoffice.com',
    //   subject: 'Johnson Family Office - Verify Your Device',
    //   html: `
    //     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //       <h2>Hello ${userName},</h2>
    //       <p>A new device is trying to access your Johnson Family Office account.</p>
    //       <p>Your verification code is:</p>
    //       <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px;">
    //         ${code}
    //       </div>
    //       <p>This code will expire in 15 minutes.</p>
    //       <p>If you didn't request this code, please ignore this email.</p>
    //       <hr style="margin: 40px 0;">
    //       <p style="color: #666; font-size: 12px;">Johnson Family Office</p>
    //     </div>
    //   `,
    // };
    // await sgMail.send(msg);
  }

  static async sendPasswordResetLink(email: string, resetLink: string, userName: string): Promise<void> {
    if (process.env.NODE_ENV === 'development') {

      return;
    }

    // Production email implementation
  }

  static async sendWelcomeEmail(email: string, userName: string, setupLink: string): Promise<void> {
    if (process.env.NODE_ENV === 'development') {

      return;
    }

    // Production email implementation
  }

  static async sendNewDeviceAlert(email: string, userName: string, deviceInfo: {
    name?: string;
    browser?: string;
    os?: string;
    location?: string;
  }): Promise<void> {
    if (process.env.NODE_ENV === 'development') {

      return;
    }

    // Production email implementation
  }

  // Generate a 6-digit verification code
  static generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}