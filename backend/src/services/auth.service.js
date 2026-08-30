const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const { ConflictError, BadRequestError, UnauthorizedError } = require('../utils/errors');
const logger = require('../utils/logger');

// In-Memory fallback store when MongoDB is not connected
const memoryUsers = new Map();

const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'super_secret_jwt_key_notes_app_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

const registerUser = async (userData) => {
  const { name, email, password } = userData;

  if (!name || !email || !password) {
    throw new BadRequestError('Please provide all required fields: name, email, and password.');
  }

  const cleanEmail = email.toLowerCase().trim();

  // If MongoDB is connected, use Mongoose
  if (mongoose.connection.readyState === 1) {
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      throw new ConflictError('A user with this email already exists.');
    }

    const user = await User.create({
      name,
      email: cleanEmail,
      password
    });

    const token = generateToken(user._id);
    logger.info(`User registered via MongoDB: ${user.email} (${user._id})`);

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      },
      token
    };
  }

  // Fallback: In-Memory Store
  if (memoryUsers.has(cleanEmail)) {
    throw new ConflictError('A user with this email already exists.');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

  const newUser = {
    _id: userId,
    name,
    email: cleanEmail,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };

  memoryUsers.set(cleanEmail, newUser);
  const token = generateToken(userId);
  logger.info(`User registered via In-Memory fallback: ${cleanEmail} (${userId})`);

  return {
    user: {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      createdAt: newUser.createdAt
    },
    token
  };
};

const loginUser = async (credentials) => {
  const { email, password } = credentials;

  if (!email || !password) {
    throw new BadRequestError('Please provide email and password.');
  }

  const cleanEmail = email.toLowerCase().trim();

  // If MongoDB is connected, use Mongoose
  if (mongoose.connection.readyState === 1) {
    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid credentials.');
    }

    const token = generateToken(user._id);
    logger.info(`User logged in via MongoDB: ${user.email} (${user._id})`);

    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      },
      token
    };
  }

  // Fallback: In-Memory Store
  const user = memoryUsers.get(cleanEmail);
  if (!user) {
    throw new UnauthorizedError('Invalid credentials.');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid credentials.');
  }

  const token = generateToken(user._id);
  logger.info(`User logged in via In-Memory fallback: ${user.email} (${user._id})`);

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    },
    token
  };
};

const getUserProfile = async (userId) => {
  if (mongoose.connection.readyState === 1) {
    const user = await User.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found.');
    }
    return user;
  }

  // Fallback: In-Memory Store
  for (const user of memoryUsers.values()) {
    if (user._id === userId) {
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      };
    }
  }

  throw new UnauthorizedError('User not found.');
};

module.exports = {
  generateToken,
  registerUser,
  loginUser,
  getUserProfile
};
