import otpGenerator from "otp-generator";

export const generateOtp = () => {
  return Number(
    otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false,
    })
  );
};