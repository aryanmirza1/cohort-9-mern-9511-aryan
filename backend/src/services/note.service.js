const mongoose = require('mongoose');
const Note = require('../models/note.model');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const logger = require('../utils/logger');

// In-Memory fallback store for notes when MongoDB is disconnected
const memoryNotes = new Map();

const createNote = async (userId, noteData) => {
  const { title, content, tags, isPinned, color } = noteData;

  if (!title || !content) {
    throw new BadRequestError('Title and content are required.');
  }

  if (mongoose.connection.readyState === 1) {
    const note = await Note.create({
      title,
      content,
      tags: Array.isArray(tags) ? tags : [],
      isPinned: Boolean(isPinned),
      color: color || '#6366f1',
      user: userId
    });

    logger.info(`Note created by user ${userId} via MongoDB: ${note._id}`);
    return note;
  }

  // Fallback: In-Memory
  const noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const newNote = {
    _id: noteId,
    title,
    content,
    tags: Array.isArray(tags) ? tags : [],
    isPinned: Boolean(isPinned),
    color: color || '#6366f1',
    user: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  memoryNotes.set(noteId, newNote);
  logger.info(`Note created by user ${userId} via In-Memory fallback: ${noteId}`);
  return newNote;
};

const getNotes = async (userId, query = {}) => {
  if (mongoose.connection.readyState === 1) {
    const filter = { user: userId };

    if (query.search) {
      const searchRegex = new RegExp(query.search, 'i');
      filter.$or = [
        { title: searchRegex },
        { content: searchRegex },
        { tags: searchRegex }
      ];
    }

    if (query.tag) {
      filter.tags = query.tag;
    }

    if (query.isPinned !== undefined) {
      filter.isPinned = query.isPinned === 'true';
    }

    return await Note.find(filter).sort({ isPinned: -1, createdAt: -1 });
  }

  // Fallback: In-Memory Filter
  let userNotes = Array.from(memoryNotes.values()).filter(
    (n) => String(n.user) === String(userId)
  );

  if (query.search) {
    const searchLower = query.search.toLowerCase();
    userNotes = userNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(searchLower) ||
        n.content.toLowerCase().includes(searchLower) ||
        n.tags.some((t) => t.toLowerCase().includes(searchLower))
    );
  }

  if (query.tag) {
    userNotes = userNotes.filter((n) => n.tags.includes(query.tag));
  }

  if (query.isPinned !== undefined) {
    const pinnedBool = query.isPinned === 'true';
    userNotes = userNotes.filter((n) => n.isPinned === pinnedBool);
  }

  // Sort pinned first, then newest
  return userNotes.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
};

const getNoteById = async (userId, noteId) => {
  if (mongoose.connection.readyState === 1) {
    const note = await Note.findById(noteId);
    if (!note) {
      throw new NotFoundError('Note not found.');
    }
    if (note.user.toString() !== userId.toString()) {
      throw new ForbiddenError('Access denied. You do not own this note.');
    }
    return note;
  }

  // Fallback: In-Memory
  const note = memoryNotes.get(noteId);
  if (!note) {
    throw new NotFoundError('Note not found.');
  }
  if (String(note.user) !== String(userId)) {
    throw new ForbiddenError('Access denied. You do not own this note.');
  }
  return note;
};

const updateNote = async (userId, noteId, updateData) => {
  if (mongoose.connection.readyState === 1) {
    const note = await Note.findById(noteId);
    if (!note) {
      throw new NotFoundError('Note not found.');
    }
    if (note.user.toString() !== userId.toString()) {
      throw new ForbiddenError('Access denied. You cannot update this note.');
    }

    const allowedUpdates = ['title', 'content', 'tags', 'isPinned', 'color'];
    allowedUpdates.forEach((field) => {
      if (updateData[field] !== undefined) {
        note[field] = updateData[field];
      }
    });

    await note.save();
    logger.info(`Note ${noteId} updated by user ${userId}`);
    return note;
  }

  // Fallback: In-Memory
  const note = memoryNotes.get(noteId);
  if (!note) {
    throw new NotFoundError('Note not found.');
  }
  if (String(note.user) !== String(userId)) {
    throw new ForbiddenError('Access denied. You cannot update this note.');
  }

  const allowedUpdates = ['title', 'content', 'tags', 'isPinned', 'color'];
  allowedUpdates.forEach((field) => {
    if (updateData[field] !== undefined) {
      note[field] = updateData[field];
    }
  });

  note.updatedAt = new Date().toISOString();
  memoryNotes.set(noteId, note);
  logger.info(`Note ${noteId} updated via In-Memory fallback by user ${userId}`);
  return note;
};

const deleteNote = async (userId, noteId) => {
  if (mongoose.connection.readyState === 1) {
    const note = await Note.findById(noteId);
    if (!note) {
      throw new NotFoundError('Note not found.');
    }
    if (note.user.toString() !== userId.toString()) {
      throw new ForbiddenError('Access denied. You cannot delete this note.');
    }

    await note.deleteOne();
    logger.info(`Note ${noteId} deleted by user ${userId}`);
    return { id: noteId };
  }

  // Fallback: In-Memory
  const note = memoryNotes.get(noteId);
  if (!note) {
    throw new NotFoundError('Note not found.');
  }
  if (String(note.user) !== String(userId)) {
    throw new ForbiddenError('Access denied. You cannot delete this note.');
  }

  memoryNotes.delete(noteId);
  logger.info(`Note ${noteId} deleted via In-Memory fallback by user ${userId}`);
  return { id: noteId };
};

module.exports = {
  createNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote
};
