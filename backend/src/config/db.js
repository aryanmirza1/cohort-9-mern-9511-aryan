const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  const connStr = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/notes_db';
  logger.info(`Connecting to MongoDB...`);

  try {
    const conn = await mongoose.connect(connStr);
    logger.info(`MongoDB Connected successfully: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.warn(`Primary MongoDB Connection failed (${error.message}). Trying fallback local database...`);
    try {
      const localFallback = 'mongodb://127.0.0.1:27017/notes_db';
      const conn = await mongoose.connect(localFallback);
      logger.info(`Local MongoDB Connected successfully: ${conn.connection.host}`);
      return conn;
    } catch (localErr) {
      logger.error(`MongoDB Connection Error: ${localErr.message}`);
      logger.info('Running backend in standalone operational mode...');
    }
  }
};

module.exports = connectDB;
