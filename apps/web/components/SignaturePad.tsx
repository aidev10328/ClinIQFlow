'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface SignaturePadProps {
  onSignatureChange: (signature: { dataUrl: string | null; typedName: string; mode: 'draw' | 'type' }) => void;
  initialName?: string;
  disabled?: boolean;
}

// Signature-style fonts (we'll use Google Fonts)
const signatureFonts = [
  { name: 'Dancing Script', class: 'font-dancing' },
  { name: 'Great Vibes', class: 'font-vibes' },
  { name: 'Allura', class: 'font-allura' },
  { name: 'Sacramento', class: 'font-sacramento' },
];

export default function SignaturePad({ onSignatureChange, initialName = '', disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('type');
  const [typedName, setTypedName] = useState(initialName);
  const [selectedFont, setSelectedFont] = useState(0);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2; // For retina displays
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    // Set drawing style
    ctx.strokeStyle = '#1e3a5f'; // Dark blue ink
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Get position from event
  const getPosition = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Start drawing
  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || mode !== 'draw') return;
    e.preventDefault();

    const pos = getPosition(e);
    lastPos.current = pos;
    setIsDrawing(true);
  }, [disabled, mode, getPosition]);

  // Draw
  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled || mode !== 'draw') return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pos = getPosition(e);

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastPos.current = pos;
    setHasDrawn(true);
  }, [isDrawing, disabled, mode, getPosition]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      // Notify parent of signature change
      const canvas = canvasRef.current;
      if (canvas && hasDrawn) {
        onSignatureChange({
          dataUrl: canvas.toDataURL('image/png'),
          typedName: '',
          mode: 'draw',
        });
      }
    }
  }, [isDrawing, hasDrawn, onSignatureChange]);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onSignatureChange({ dataUrl: null, typedName: '', mode: 'draw' });
  }, [onSignatureChange]);

  // Handle typed name change
  const handleTypedNameChange = useCallback((name: string) => {
    setTypedName(name);
    onSignatureChange({
      dataUrl: null,
      typedName: name,
      mode: 'type',
    });
  }, [onSignatureChange]);

  // Handle mode change
  const handleModeChange = useCallback((newMode: 'draw' | 'type') => {
    setMode(newMode);
    if (newMode === 'type' && typedName) {
      onSignatureChange({ dataUrl: null, typedName, mode: 'type' });
    } else if (newMode === 'draw' && hasDrawn) {
      const canvas = canvasRef.current;
      if (canvas) {
        onSignatureChange({ dataUrl: canvas.toDataURL('image/png'), typedName: '', mode: 'draw' });
      }
    } else {
      onSignatureChange({ dataUrl: null, typedName: '', mode: newMode });
    }
  }, [typedName, hasDrawn, onSignatureChange]);

  return (
    <div className="signature-pad-container">
      {/* Mode Selector */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => handleModeChange('type')}
          disabled={disabled}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg border transition-colors ${
            mode === 'type'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Type Signature
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('draw')}
          disabled={disabled}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg border transition-colors ${
            mode === 'draw'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Draw Signature
        </button>
      </div>

      {/* Typed Signature Mode */}
      {mode === 'type' && (
        <div className="space-y-3">
          <input
            type="text"
            value={typedName}
            onChange={(e) => handleTypedNameChange(e.target.value)}
            placeholder="Type your full legal name"
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
          />

          {/* Font Selector */}
          {typedName && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {signatureFonts.map((font, index) => (
                <button
                  key={font.name}
                  type="button"
                  onClick={() => setSelectedFont(index)}
                  disabled={disabled}
                  className={`flex-shrink-0 px-3 py-1 text-xs rounded border transition-colors ${
                    selectedFont === index
                      ? 'bg-primary-100 border-primary-500 text-primary-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {font.name}
                </button>
              ))}
            </div>
          )}

          {/* Signature Preview */}
          <div className="relative bg-white border-2 border-gray-200 rounded-lg p-4 min-h-[100px] flex items-center justify-center">
            {typedName ? (
              <div
                className={`text-3xl sm:text-4xl text-gray-800 ${signatureFonts[selectedFont].class}`}
                style={{
                  fontFamily: signatureFonts[selectedFont].name + ', cursive',
                }}
              >
                {typedName}
              </div>
            ) : (
              <span className="text-gray-400 text-sm">Your signature will appear here</span>
            )}
            {/* Signature line */}
            <div className="absolute bottom-4 left-4 right-4 border-b border-gray-300" />
          </div>
        </div>
      )}

      {/* Draw Signature Mode */}
      {mode === 'draw' && (
        <div className="space-y-2">
          <div className="relative">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className={`w-full h-[150px] border-2 border-gray-200 rounded-lg cursor-crosshair touch-none ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              style={{ backgroundColor: '#fff' }}
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-gray-400 text-sm">Sign here with your mouse or finger</span>
              </div>
            )}
            {/* Signature line */}
            <div className="absolute bottom-6 left-4 right-4 border-b border-gray-300 pointer-events-none" />
          </div>

          <button
            type="button"
            onClick={clearCanvas}
            disabled={disabled || !hasDrawn}
            className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear signature
          </button>
        </div>
      )}

      {/* Legal notice */}
      <p className="mt-3 text-xs text-gray-500">
        By signing above, you agree that this electronic signature is legally binding and has the same effect as a handwritten signature.
      </p>
    </div>
  );
}
