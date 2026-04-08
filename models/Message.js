import { DataTypes } from 'sequelize';
import { sequelize } from '../config/postgresql.js';

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  conversationId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  receiverId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'messages',
  timestamps: true,
  indexes: [
    { fields: ['conversationId'] },
    { fields: ['senderId'] },
    { fields: ['receiverId'] },
    { fields: ['read'] },
    { fields: ['conversationId', 'createdAt'] }
  ]
});

export default Message;
