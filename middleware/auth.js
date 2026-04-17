const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET || "baseera_super_secret_key");
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token is not valid" });
  }
};

const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied: Admins only" });
    }
    next();
  });
};

const staffAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user.role !== "admin" && req.user.role !== "quality") {
      return res.status(403).json({ error: "Access denied: Management/Quality role required" });
    }
    next();
  });
};

module.exports = { auth, adminAuth, staffAuth };
