import express from 'express';
import { protectedAuth, allowRoles } from '../middleware/common/protectedAuth.js';
import { listEmailConfigs, createEmailConfig, updateEmailConfig, deleteEmailConfig } from '../controllers/emailConfig.controller.js';

const router = express.Router();

router.get('/', protectedAuth, allowRoles('admin','superadmin'), listEmailConfigs);
router.post('/', protectedAuth, allowRoles('admin','superadmin'), createEmailConfig);
router.put('/:id', protectedAuth, allowRoles('admin','superadmin'), updateEmailConfig);
router.delete('/:id', protectedAuth, allowRoles('admin','superadmin'), deleteEmailConfig);

export default router;
