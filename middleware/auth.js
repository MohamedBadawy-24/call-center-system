const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "No token, authorization denied" });

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: "System configuration error: JWT_SECRET missing" });
    }

    const decoded = jwt.verify(token.replace("Bearer ", ""), jwtSecret);
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
