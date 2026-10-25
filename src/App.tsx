import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { HomePage } from './components/HomePage';
import { ChatRoom } from './components/ChatRoom';
import { PostUnlockModal } from './components/PostUnlockModal';
import { RoomDetails } from './types';
import { clearRoomToken } from './services/api';

const AppContent: React.FC = () => {
  const { user } = useAuth();
  const [activeRoom, setActiveRoom] = useState<RoomDetails | null>(null);
  const [showPostUnlockNotice, setShowPostUnlockNotice] = useState(false);

  const handleRoomSelected = (room: RoomDetails) => {
    setActiveRoom(room);
    setShowPostUnlockNotice(true);
  };

  const handleLeaveRoom = () => {
    if (activeRoom) {
      clearRoomToken(activeRoom.id);
    }
    setActiveRoom(null);
    setShowPostUnlockNotice(false);
  };

  const handleRoomDeleted = () => {
    if (activeRoom) {
      clearRoomToken(activeRoom.id);
    }
    setActiveRoom(null);
    setShowPostUnlockNotice(false);
  };

  return (
    <>
      {activeRoom ? (
        <>
          <ChatRoom
            room={activeRoom}
            currentUserId={user?.id || 'guest'}
            onLeaveRoom={handleLeaveRoom}
            onRoomDeleted={handleRoomDeleted}
          />

          {showPostUnlockNotice && (
            <PostUnlockModal
              isOpen={showPostUnlockNotice}
              roomName={activeRoom.name}
              onDismiss={() => setShowPostUnlockNotice(false)}
            />
          )}
        </>
      ) : (
        <HomePage onRoomSelected={handleRoomSelected} />
      )}
    </>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
