import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const user = process.env.EMAIL_USER;

/**
 * SEND OTP EMAIL: Sends one time password to user for password reset
 * @param {String} to
 * @param {String} otp
 * @returns
 */
export const sentOtpEmail = async (to, otp) => {
  try {
    // validation
    if (!to || !to.includes("@")) {
      console.error("Invalid email address:", to);
      return false;
    }

    const info = await transporter.sendMail({
      from: user,
      to: to,
      subject: "Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset. Use the code below to proceed:</p>
          <h1 style="color: #2563eb; letter-spacing: 5px; font-size: 32px;">${otp}</h1>
          <p style="color: #666;">This code expires in <strong>10 minutes</strong>.</p>          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error("Error sending otp email: ", error);
    return false;
  }
};

/**
 * SEND CONFIRMATION EMAIL:
 * @param {String} to
 * @param {Array} details - {payeeName, amount, referenceNumber, date, purpose}
 * @returns
 */
export const sendConfirmationEmail = async (to, details) => {
  try {
    if (!to || !to.includes("@")) {
      console.error("Invalid email address:", to);
      return false;
    }

    const info = await transporter.sendMail({
      from: user,
      to: to,
      subject: "Payment confirmation",
      html: `<!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Disbursement Approved</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="min-width: 100%; background-color: #f3f4f6;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
                  
                  <tr>
                    <td style="background-color: #2563eb; padding: 30px 40px; text-align: center;">
                      <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 600;">Disbursement Approved</h1>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 40px;">
                      <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 20px 0;">
                        Hello,
                      </p>
                      <p style="color: #374151; font-size: 16px; line-height: 24px; margin: 0 0 30px 0;">
                        We are pleased to inform you that the disbursement request has been successfully <strong>approved</strong> and is now being processed.
                      </p>

                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                        <tr>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">Reference No.</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.referenceNumber}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">Payee</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.payeeName}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">Date Approved</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.date}</span>
                          </td>
                        </tr>
                         <tr>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">Purpose</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.purpose}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 15px 20px;">
                            <span style="color: #64748b; font-size: 14px;">Total Amount</span>
                          </td>
                          <td style="padding: 15px 20px; text-align: right;">
                            <span style="color: #16a34a; font-weight: 700; font-size: 18px;">${details.amount}</span>
                          </td>
                        </tr>
                      </table>

                      <p style="color: #6b7280; font-size: 14px; margin-top: 30px; text-align: center;">
                        You can view the full details of this transaction on your dashboard.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                        &copy; ${new Date().getFullYear()} FundWatch Application. All rights reserved.
                      </p>
                    </td>
                  </tr>

                </table>
                </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
    return true;
  } catch (error) {
    console.error("Error sending confirmation email: ", error);
    return false;
  }
};
