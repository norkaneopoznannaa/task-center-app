import React, { useCallback, useEffect, useState } from 'react';
import './ResizeHandle.css';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
  position: 'left' | 'right';
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({ onResize, position }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartX(e.clientX);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = position === 'left'
        ? startX - e.clientX  // For left-side resize (dragging left increases width)
        : e.clientX - startX;

      if (deltaX !== 0) {
        onResize(deltaX);
        setStartX(e.clientX);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startX, onResize, position]);

  return (
    <div
      className={`resize-handle resize-handle-${position} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="resize-handle-line" />
    </div>
  );
};
