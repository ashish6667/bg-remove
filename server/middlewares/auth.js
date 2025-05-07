import jwt from "jsonwebtoken";

const authUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Not Authorized. Login Again." });
    }

    const token = authHeader.split(" ")[1];

    const token_decode = jwt.decode(token); // Clerk JWT
    if (!token_decode || !token_decode.sub) {
      return res.status(401).json({ success: false, message: "Invalid token or clerkId missing." });
    }

    req.clerkId = token_decode.sub;
    next();
  } catch (error) {
    console.log("Error in authUser middleware:", error.message);
    res.status(401).json({ success: false, message: error.message });
  }
};

export default authUser;
