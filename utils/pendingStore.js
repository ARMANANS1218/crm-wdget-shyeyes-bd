// pendingStore.js

// In-memory store
export const pendingUsers = {}; // <-- named export

export const addPendingUser = (email, data) => {
  pendingUsers[email] = {
    ...data,
    resendAttempts: 0,
  };
};

export const getPendingUser = (email) => pendingUsers[email] || null;

export const findPendingUserByOtp = (otp) => {
  for (const email in pendingUsers) {
    if (pendingUsers[email].otp === otp) {
      return { email, data: pendingUsers[email] };
    }
  }
  return null;
};

export const updatePendingUser = (email, updates) => {
  if (pendingUsers[email]) {
    pendingUsers[email] = { ...pendingUsers[email], ...updates };
  }
};

export const removePendingUser = (email) => {
  delete pendingUsers[email];
};
