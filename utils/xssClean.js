// src/utils/xssClean.js
import xss from "xss";

/**
 * Recursively sanitize an object or string
 * @param {Object|String} data
 */
const sanitize = (data) => {
  if (typeof data === "string") return xss(data);
  if (typeof data === "object" && data !== null) {
    for (const key in data) {
      if (Object.hasOwn(data, key)) {
        data[key] = sanitize(data[key]);
      }
    }
  }
  return data;
};

/**
 * XSS Clean Middleware
 */
const xssClean = (req, res, next) => {
  if (req.body) sanitize(req.body);     // sanitize body
  if (req.query) sanitize(req.query);   // sanitize query params
  if (req.params) sanitize(req.params); // sanitize route params
  next();
};

export default xssClean;
