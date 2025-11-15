import EmailConfig from '../models/EmailConfig.js';
import { protectedResponse } from '../utils/protectedResponse.js';

// List all email configs (admins see all for now)
export const listEmailConfigs = async (req, res) => {
  try {
    const configs = await EmailConfig.find().sort({ updatedAt: -1 });
    res.json({ success: true, configs });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const createEmailConfig = async (req, res) => {
  try {
    const data = req.body;
    const cfg = await EmailConfig.create(data);
    res.status(201).json({ success: true, config: cfg });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already configured' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

export const updateEmailConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const cfg = await EmailConfig.findByIdAndUpdate(id, req.body, { new: true });
    if (!cfg) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, config: cfg });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteEmailConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const cfg = await EmailConfig.findByIdAndDelete(id);
    if (!cfg) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, deleted: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
