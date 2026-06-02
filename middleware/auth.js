const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authenticate = async (req, res) => {
  const token = req.header("Authorization");
  if (!token) {
    res.status(401).json({ error: "No token, authorization denied" });
    return false;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ error: "System configuration error: JWT_SECRET missing" });
      return false;
    }

    const decoded = jwt.verify(token.replace("Bearer ", ""), jwtSecret);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      res.status(401).json({ error: "User no longer exists" });
      return false;
    }

    if (user.suspended) {
      res.status(403).json({ error: "Account suspended. Contact your manager." });
      return false;
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      currentStatus: user.currentStatus,
      statusStartedAt: user.statusStartedAt
    };
    return true;
  } catch (err) {
    res.status(401).json({ error: "Token is not valid" });
    return false;
  }
};

const auth = async (req, res, next) => {
  const ok = await authenticate(req, res);
  if (!ok) return;
  next();
};

const adminAuth = async (req, res, next) => {
  const ok = await authenticate(req, res);
  if (!ok) return;
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied: Admins only" });
  }
  next();
};

const staffAuth = async (req, res, next) => {
  const ok = await authenticate(req, res);
  if (!ok) return;
  if (req.user.role !== "admin" && req.user.role !== "quality") {
    return res.status(403).json({ error: "Access denied: Management/Quality role required" });
  }
  next();
};

/** Agents must be in active status for call-handling routes */
const agentActiveAuth = async (req, res, next) => {
  const ok = await authenticate(req, res);
  if (!ok) return;
  if (req.user.role === "agent" && req.user.currentStatus !== "active") {
    return res.status(403).json({ error: "You must be active to perform this action" });
  }
  next();
};

module.exports = { auth, adminAuth, staffAuth, agentActiveAuth };
