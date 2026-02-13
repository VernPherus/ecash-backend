import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const MAIL_FROM_ADDRESS = process.env.EMAIL_USER;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME;
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL;
const securityEmail = `"${MAIL_FROM_NAME} - Security" <${MAIL_FROM_ADDRESS}>`;
const senderEmail = `"${MAIL_FROM_NAME}" <${MAIL_FROM_ADDRESS}>`;

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
      from: securityEmail,
      to: to,
      subject: "Password Reset",
      html: `
        <!DOCTYPE html>
        <html>
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset. Use the code below to proceed:</p>
          <h1 style="color: #2563eb; letter-spacing: 5px; font-size: 32px;">${otp}</h1>
          <p style="color: #666;">This code expires in <strong>10 minutes</strong>.</p>          
          <p style="font-size: 12px; color: #999;">If you did not request this, please ignore this email.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          
          <!-- Footer Section -->
          <div style="margin-top: 20px;">
            <!-- Company Details -->
            <p style="font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 16px;">
              DEPARTMENT OF SCIENCE AND TECHNOLOGY - ILOCOS REGION <br> 
              DMMMSU - MLUC, City of San Fernando, La Union <br> 
              Telefax #s (072) 888-3399 <br>
              Mobile #s 0998-962-0232 / 0917-840-8695 <br>
              Website: <a href="http://region1.dost.gov.ph">http://region1.dost.gov.ph</a><br>
              Email: cash@region1.dost.gov.ph <br>
            </p>
            
            <!-- Confidentiality Notice -->
            <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-left: 3px solid #cbd5e1;">
            <strong>CONFIDENTIALITY NOTICE: </strong> This message an all accompanying documents are CONFIDENTIAL. This is intended only for the person or the company to whom it is addressed. If you are not the intended recipient, you are hereby notified that any use, disclosure, distribution, copying, or taking any action based on the content of this electronic message or any part thereof, is strictly prohibited. If you have received this communication in error, please notify us immediately and return the original message to us.
            </p>
            
            <!-- Copyright -->
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              &copy; ${new Date().getFullYear()} eCash. All rights reserved.
            </p>
          </div>
        </div>
        </html>
      `,
    });

    console.log("Message ID: " + info.messageId);

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
      from: senderEmail,
      to: to,
      subject: "Payment confirmation",
      html: `
            <!DOCTYPE html>
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
                            <span style="color: #64748b; font-size: 14px;">Fund Source:</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.fundSource}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">Project:</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.projectName}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">LDDAP/Check Number:</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.referenceNumber}</span>
                          </td>
                        </tr>
                                                <tr>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">DV Number: </span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1e293b; font-weight: 600; font-size: 14px;">${details.dvNum}</span>
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
                            <span style="color: #64748b; font-size: 14px;">Particulars</span>
                          </td>
                          <td style="padding: 15px 20px; border-bottom: 1px solid #e2e8f0; text-align: left;">
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

                      <!-- Inquiries Section -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 30px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;">
                        <tr>
                          <td style="padding: 20px; text-align: center;">
                            <p style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">
                              Need Help?
                            </p>
                            <p style="color: #1e40af; font-size: 14px; margin: 0 0 4px 0;">
                              For inquiries or assistance, please contact us at:
                            </p>
                            <p style="margin: 0;">
                              email: <a href="mailto:cash@region1.dost.gov.ph" style="color: #2563eb; font-size: 14px; font-weight: 600; text-decoration: none;">
                                cash@region1.dost.gov.ph
                              </a><br>
                              phone: 0960 408 8190
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <!-- Footer Section -->
                  <tr>
                    <td style="background-color: #f1f5f9; padding: 24px 30px; border-top: 1px solid #e2e8f0;">
                      
                      <!-- Company Details -->
                      <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0; text-align: center;">
                        DEPARTMENT OF SCIENCE AND TECHNOLOGY - ILOCOS REGION <br> 
                        DMMMSU - MLUC, City of San Fernando, La Union <br> 
                        Telefax #s (072) 888-3399 <br>
                        Mobile #s 0998-962-0232 / 0917-840-8695 <br>
                        Website: <a href="http://region1.dost.gov.ph">http://region1.dost.gov.ph</a><br>
                        Email: cash@region1.dost.gov.ph <br>
                      </p>
                      
                      <!-- Confidentiality Notice -->
                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 16px;">
                        <tr>
                          <td style="background-color: #ffffff; border-left: 3px solid #cbd5e1; padding: 12px 15px;">
                            <p style="color: #64748b; font-size: 11px; line-height: 1.5; margin: 0;">
                              <strong>CONFIDENTIALITY NOTICE: </strong> This message an all accompanying documents are CONFIDENTIAL. This is intended only for the person or the company to whom it is addressed. If you are not the intended recipient, you are hereby notified that any use, discloser, distribution, copying, or taking any action based on the content of this electronic message or any part thereof, is strictly prohibited. If you have received this communication in error, please notify us immediately and return the original message to us.
                            </p>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Copyright -->
                      <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                        &copy; ${new Date().getFullYear()} eCash. All rights reserved.
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

    console.log("Message ID: " + info.messageId);

    return true;
  } catch (error) {
    console.error("Error sending confirmation email: ", error);
    return false;
  }
};
