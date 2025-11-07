import LocationRequest from '../models/LocationRequest.js';
import AllowedLocation from '../models/AllowedLocation.js';
import Role from '../models/Role.js';

// Haversine distance in meters
const distanceMeters = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const createLocationRequest = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (!['admin', 'agent'].includes(user.role)) {
      return res.status(403).json({ message: 'Only admin/agent can request location access' });
    }

    const { latitude, longitude, address, reason, requestType = 'permanent', startAt, endAt, radius = 100, emergency = false } = req.body;
    if (latitude == null || longitude == null || !reason) {
      return res.status(400).json({ message: 'latitude, longitude and reason are required' });
    }

    const doc = await LocationRequest.create({
      role: user._id,
      requestedByRole: user.role,
      address,
      location: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] },
      requestedRadius: Number(radius),
      reason,
      requestType,
      startAt,
      endAt,
      emergency,
    });

    return res.status(201).json({ message: 'Location request submitted', request: doc });
  } catch (err) {
    console.error('createLocationRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Unauthenticated location request for initial setup
export const createUnauthenticatedLocationRequest = async (req, res) => {
  try {
    const { email, latitude, longitude, address, reason, requestType = 'permanent', startAt, endAt, radius = 100, emergency = false } = req.body;
    if (!email || latitude == null || longitude == null || !reason) {
      return res.status(400).json({ message: 'email, latitude, longitude and reason are required' });
    }

    // Find user by email
    const user = await Role.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!['admin', 'agent'].includes(user.role)) {
      return res.status(403).json({ message: 'Only admin/agent can request location access' });
    }

    const doc = await LocationRequest.create({
      role: user._id,
      requestedByRole: user.role,
      address,
      location: { type: 'Point', coordinates: [Number(longitude), Number(latitude)] },
      requestedRadius: Number(radius),
      reason,
      requestType,
      startAt,
      endAt,
      emergency,
    });

    return res.status(201).json({ message: 'Location request submitted', request: doc });
  } catch (err) {
    console.error('createUnauthenticatedLocationRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const listLocationRequests = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Only superadmin and admin can view requests' });
    }

    const { status, emergency, page = 1, limit = 20, adminScope } = req.query;
    const q = {};
    if (status) q.status = status;
    if (emergency != null) q.emergency = emergency === 'true';

    // If admin role or adminScope is requested, filter for agent requests only
    if (user.role === 'admin' || adminScope === 'true') {
      q.requestedByRole = 'agent';
    }

    const docs = await LocationRequest.find(q)
      .populate('role', 'name email role')
      .populate('reviewedBy', 'name email role')
      .sort({ emergency: -1, createdAt: 1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const count = await LocationRequest.countDocuments(q);
    return res.json({ message: 'Requests fetched', data: { items: docs, page: Number(page), limit: Number(limit), count } });
  } catch (err) {
    console.error('listLocationRequests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const reviewLocationRequest = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Only superadmin and admin can review requests' });
    }

    const { id } = req.params;
    const { action, reviewComments } = req.body; // action: 'approve' | 'reject'

    const request = await LocationRequest.findById(id).populate('role', 'name email role');
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request already ${request.status}` });
    }

    // Admin can only review agent requests
    if (user.role === 'admin' && request.requestedByRole !== 'agent') {
      return res.status(403).json({ message: 'Admin can only review agent requests' });
    }

    if (action === 'reject') {
      request.status = 'rejected';
      request.reviewedBy = user._id;
      request.reviewedAt = new Date();
      request.reviewComments = reviewComments;
      await request.save();
      return res.json({ message: 'Request rejected', request });
    }

    if (action === 'approve') {
      // Create allowed location
      const allowed = await AllowedLocation.create({
        role: request.role,
        label: request.address,
        address: request.address,
        location: request.location,
        radiusMeters: request.requestedRadius,
        type: request.requestType,
        startAt: request.startAt,
        endAt: request.endAt,
        isActive: true,
        addedBy: user._id,
      });

      request.status = 'approved';
      request.reviewedBy = user._id;
      request.reviewedAt = new Date();
      request.reviewComments = reviewComments;
      await request.save();

      return res.json({ message: 'Request approved', request, allowedLocation: allowed });
    }

    return res.status(400).json({ message: 'Invalid action' });
  } catch (err) {
    console.error('reviewLocationRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const listAllowedLocations = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const { roleId, adminScope } = req.query;
    let targetRoleId = user._id;
    let query = {};

    // For superadmin, can query specific roleId
    if (user.role === 'superadmin' && roleId) {
      targetRoleId = roleId;
    }

    // For admin or when adminScope is requested, show agent locations
    if (user.role === 'admin' || adminScope === 'true') {
      // Find agent locations by populating role and filtering
      query = { isActive: true };
    } else {
      // Regular user or superadmin without admin scope
      query = { role: targetRoleId, isActive: true };
    }

    const now = new Date();
    query.$or = [
      { type: 'permanent' },
      { type: 'temporary', startAt: { $lte: now }, endAt: { $gte: now } },
    ];

    let docsQuery = AllowedLocation.find(query).populate('role', 'name email role').sort({ createdAt: -1 });
    const docs = await docsQuery;

    // Filter by agent role if admin scope
    let filteredDocs = docs;
    if (user.role === 'admin' || adminScope === 'true') {
      filteredDocs = docs.filter(doc => 
        doc.role && (doc.role.role === 'agent' || doc.role.role === 'Agent')
      );
    }

    return res.json({ message: 'Allowed locations fetched', data: filteredDocs });
  } catch (err) {
    console.error('listAllowedLocations error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const revokeAllowedLocation = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Only superadmin and admin can revoke' });
    }

    const { id } = req.params;
    const doc = await AllowedLocation.findById(id);
    if (!doc) return res.status(404).json({ message: 'Allowed location not found' });

    doc.isActive = false;
    doc.revokedBy = user._id;
    doc.revokedAt = new Date();
    await doc.save();

    return res.json({ message: 'Allowed location revoked', data: doc });
  } catch (err) {
    console.error('revokeAllowedLocation error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Delete allowed location permanently
export const deleteAllowedLocation = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Only superadmin and admin can delete locations' });
    }

    const { id } = req.params;
    const doc = await AllowedLocation.findById(id);
    if (!doc) return res.status(404).json({ message: 'Allowed location not found' });

    // Permanently delete the location record
    await AllowedLocation.findByIdAndDelete(id);

    return res.json({ message: 'Allowed location deleted permanently' });
  } catch (err) {
    console.error('deleteAllowedLocation error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Delete location request permanently - simple approach for superadmin
export const deleteLocationRequest = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Only superadmin and admin can delete location requests' });
    }

    const { requestId } = req.params;
    
    // Get the request first
    const request = await LocationRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Location request not found' });
    }

    // Delete the request permanently
    await LocationRequest.findByIdAndDelete(requestId);

    // Also try to find and delete any corresponding allowed location (best effort)
    try {
      const allowedLocations = await AllowedLocation.find({
        role: request.role
      });
      
      // Delete all allowed locations for this user role to be thorough
      for (const loc of allowedLocations) {
        const coordsMatch = Math.abs(loc.location.coordinates[0] - request.location.coordinates[0]) < 0.01 &&
                           Math.abs(loc.location.coordinates[1] - request.location.coordinates[1]) < 0.01;
        if (coordsMatch) {
          await AllowedLocation.findByIdAndDelete(loc._id);
        }
      }
    } catch (cleanupError) {
      console.log('Cleanup of allowed locations failed, but request deleted:', cleanupError);
    }

    return res.json({ 
      message: 'Location request deleted permanently',
      deletedRequest: request
    });
  } catch (err) {
    console.error('deleteLocationRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Stop access by request - finds and revokes the allowed location for an approved request
export const stopAccessByRequest = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Access denied. SuperAdmin or Admin required.' });
    }

    const { id } = req.params; // This is the request ID
    
    // Find the request first
    const request = await LocationRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Location request not found' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ message: 'Can only stop access for approved requests' });
    }

    // Find all active allowed locations for this user
    const allowedLocations = await AllowedLocation.find({
      role: request.role,
      isActive: true
    });

    if (allowedLocations.length === 0) {
      return res.status(404).json({ message: 'No active allowed locations found for this user' });
    }

    // Find the closest allowed location to the request coordinates (within reasonable distance)
    const [requestLng, requestLat] = request.location.coordinates;
    let closestLocation = null;
    let minDistance = Infinity;

    for (const location of allowedLocations) {
      const [lng, lat] = location.location.coordinates;
      const distance = distanceMeters([lng, lat], [requestLng, requestLat]);
      
      // Consider it a match if within 50 meters (to account for GPS precision)
      if (distance <= 50 && distance < minDistance) {
        minDistance = distance;
        closestLocation = location;
      }
    }

    if (!closestLocation) {
      return res.status(404).json({ 
        message: 'No matching allowed location found for this request coordinates',
        details: `Searched for location near ${requestLat}, ${requestLng}`
      });
    }

    // Revoke the closest allowed location
    closestLocation.isActive = false;
    closestLocation.revokedBy = user._id;
    closestLocation.revokedAt = new Date();
    await closestLocation.save();

    // Update request status to 'stopped'
    request.status = 'stopped';
    request.stoppedBy = user._id;
    request.stoppedAt = new Date();
    await request.save();

    return res.json({ 
      message: 'Location access stopped successfully', 
      data: {
        request: request,
        revokedLocation: closestLocation,
        distance: minDistance
      }
    });
  } catch (err) {
    console.error('stopAccessByRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Start access by request - reactivates the allowed location for a stopped request
export const startAccessByRequest = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !['superadmin', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Access denied. SuperAdmin or Admin required.' });
    }

    const { id } = req.params; // This is the request ID
    
    // Find the request first
    const request = await LocationRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Location request not found' });
    }

    if (request.status !== 'stopped') {
      return res.status(400).json({ message: 'Can only start access for stopped requests' });
    }

    // Find the inactive allowed location for this user that matches the request
    const allowedLocations = await AllowedLocation.find({
      role: request.role,
      isActive: false
    });

    if (allowedLocations.length === 0) {
      return res.status(404).json({ message: 'No stopped allowed locations found for this user' });
    }

    // Find the closest allowed location to the request coordinates
    const [requestLng, requestLat] = request.location.coordinates;
    let closestLocation = null;
    let minDistance = Infinity;

    for (const location of allowedLocations) {
      const [lng, lat] = location.location.coordinates;
      const distance = distanceMeters([lng, lat], [requestLng, requestLat]);
      
      // Consider it a match if within 50 meters
      if (distance <= 50 && distance < minDistance) {
        minDistance = distance;
        closestLocation = location;
      }
    }

    if (!closestLocation) {
      return res.status(404).json({ 
        message: 'No matching stopped location found for this request coordinates'
      });
    }

    // Reactivate the closest allowed location
    closestLocation.isActive = true;
    closestLocation.revokedBy = null;
    closestLocation.revokedAt = null;
    closestLocation.reactivatedBy = user._id;
    closestLocation.reactivatedAt = new Date();
    await closestLocation.save();

    // Update request status back to 'approved'
    request.status = 'approved';
    request.stoppedBy = null;
    request.stoppedAt = null;
    request.reactivatedBy = user._id;
    request.reactivatedAt = new Date();
    await request.save();

    return res.json({ 
      message: 'Location access started successfully', 
      data: {
        request: request,
        reactivatedLocation: closestLocation,
        distance: minDistance
      }
    });
  } catch (err) {
    console.error('startAccessByRequest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Utility for login check
export const isLoginLocationAllowed = async (roleId, clientLat, clientLng, now = new Date()) => {
  const locations = await AllowedLocation.find({
    role: roleId,
    isActive: true,
    $or: [
      { type: 'permanent' },
      { type: 'temporary', startAt: { $lte: now }, endAt: { $gte: now } },
    ],
  }).lean();

  for (const loc of locations) {
    const [lng, lat] = loc.location.coordinates;
    const d = distanceMeters([lng, lat], [Number(clientLng), Number(clientLat)]);
    if (d <= (loc.radiusMeters || 100)) return true;
  }
  return false;
};
