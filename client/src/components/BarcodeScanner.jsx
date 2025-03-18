import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanLine, Camera, X, ExternalLink } from "lucide-react";
import { api } from '../utils/api';

const BarcodeScanner = ({ onScanSuccess, onClose }) => {
  const [hasCamera, setHasCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualEntry, setManualEntry] = useState('');
  const [recentScans, setRecentScans] = useState([]);
  const [permission, setPermission] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scannerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Load recent scans from localStorage
    const savedScans = localStorage.getItem('recentScans');
    if (savedScans) {
      try {
        setRecentScans(JSON.parse(savedScans).slice(0, 5));
      } catch (e) {
        console.error('Error loading recent scans', e);
      }
    }

    // Check if device has camera
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const cameras = devices.filter(device => device.kind === 'videoinput');
        setHasCamera(cameras.length > 0);
      })
      .catch(err => {
        console.error('Error checking camera:', err);
        setHasCamera(false);
      });

    // Clean up function
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    if (!hasCamera) return;
    
    try {
      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }
      });
      setPermission(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        
        // Set up barcode scanning loop
        scannerRef.current = setInterval(() => {
          captureAndScan();
        }, 500);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Could not access camera. Please allow camera access.');
      setPermission(false);
    }
  };

  const stopScanner = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    if (scannerRef.current) {
      clearInterval(scannerRef.current);
      scannerRef.current = null;
    }
    
    setScanning(false);
  };

  const captureAndScan = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // This is where you would integrate a barcode scanning library
      // For this example, we'll simulate a scan with a timeout
      // In a real implementation, you'd use a library like quagga.js or zxing
      simulateScan();
    }
  };

  const simulateScan = () => {
    // This is a simulated scan - in a real app, you'd integrate a proper barcode scanner library
    const fakeBarcodes = [
      "1234567890128", 
      "5901234123457", 
      "4006381333931", 
      "8712345678906",
      "9780201379624"
    ];
    
    // Randomly "detect" a barcode every few scans
    if (Math.random() < 0.2) {
      const randomBarcode = fakeBarcodes[Math.floor(Math.random() * fakeBarcodes.length)];
      handleScanSuccess(randomBarcode);
    }
  };

  const handleScanSuccess = (barcode) => {
    // Stop scanning
    stopScanner();
    
    // Play success sound
    const audio = new Audio('/scan-beep.mp3');
    audio.play().catch(e => console.log('Audio play failed', e));
    
    // Save to recent scans
    const updatedScans = [
      { 
        code: barcode, 
        timestamp: new Date().toISOString(),
        id: new Date().getTime()
      },
      ...recentScans
    ].slice(0, 5);
    
    setRecentScans(updatedScans);
    localStorage.setItem('recentScans', JSON.stringify(updatedScans));
    
    // Look up the item
    lookupItem(barcode);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualEntry.trim()) {
      handleScanSuccess(manualEntry.trim());
      setManualEntry('');
    }
  };

  const lookupItem = async (barcode) => {
    try {
      toast.info(`Searching for item with code: ${barcode}`);
      
      // Call API to look up item by barcode
      const response = await api.get(`/inventory/barcode/${barcode}`);
      
      if (response && response.data) {
        // Item found, navigate to it or perform action
        toast.success(`Found item: ${response.data.name}`);
        
        if (onScanSuccess) {
          onScanSuccess(response.data);
        } else {
          navigate(`/items/${response.data.id}/edit`);
        }
      } else {
        toast.warning(`No item found with code: ${barcode}`);
        // Optionally redirect to create new item form
        // navigate(`/items/new?barcode=${barcode}`);
      }
    } catch (error) {
      console.error('Error looking up barcode:', error);
      toast.error('Error looking up item');
      
      // For this demo, we'll simulate finding an item sometimes
      if (Math.random() > 0.5) {
        toast.success('Simulated mode: Item found');
        const mockItem = {
          id: `mock-${barcode}`,
          name: `Product ${barcode.substring(0, 4)}`,
          barcode: barcode,
          quantity: Math.floor(Math.random() * 100),
          category: 'Electronics',
          status: 'AVAILABLE'
        };
        
        if (onScanSuccess) {
          onScanSuccess(mockItem);
        }
      }
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto bg-zinc-900 border border-white/10 shadow-lg">
      <CardHeader className="border-b border-white/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl text-white flex items-center">
            <ScanLine className="h-5 w-5 mr-2 text-purple-400" />
            Barcode Scanner
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="text-white/70 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {/* Camera permission state */}
        {!permission && !scanning && hasCamera && (
          <div className="text-center py-8 space-y-4">
            <Camera className="h-12 w-12 mx-auto text-purple-400 opacity-75" />
            <p className="text-white/70 text-sm">Camera access is needed to scan barcodes</p>
            <Button 
              onClick={startScanner}
              className="bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
            >
              <Camera className="h-4 w-4 mr-2" />
              Allow Camera Access
            </Button>
          </div>
        )}
        
        {/* Camera feed */}
        {hasCamera && (
          <div className={`relative rounded-md overflow-hidden ${scanning ? 'block' : 'hidden'}`}>
            <video 
              ref={videoRef} 
              className="w-full h-64 object-cover"
              muted
              playsInline
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Scanning overlay */}
            {scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-64 h-64 border-2 border-purple-400 border-dashed rounded-md animate-pulse opacity-70"></div>
                <div className="w-full h-1 bg-purple-500 absolute top-1/2 transform -translate-y-1/2 animate-scan"></div>
                <p className="absolute bottom-4 text-white text-sm bg-black/50 px-2 py-1 rounded-md">
                  Scanning...
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={stopScanner}
                  className="absolute top-4 right-4 bg-black/50 border-white/20 text-white"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
        
        {/* No camera state */}
        {!hasCamera && (
          <div className="bg-yellow-500/10 text-yellow-400 p-3 rounded-md text-sm">
            No camera detected on this device. Please use manual entry.
          </div>
        )}
        
        {/* Manual entry */}
        <form onSubmit={handleManualSubmit} className="space-y-2">
          <label className="text-sm text-white/70 block">
            Manual barcode entry:
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={manualEntry}
              onChange={(e) => setManualEntry(e.target.value)}
              placeholder="Enter barcode number"
              className="flex-1 px-3 py-2 rounded-md bg-zinc-800 border border-white/10 text-white"
            />
            <Button 
              type="submit"
              disabled={!manualEntry.trim()}
              className="bg-purple-500 text-white hover:bg-purple-400"
            >
              Search
            </Button>
          </div>
        </form>
        
        {/* Scanner controls */}
        {!scanning && hasCamera && permission && (
          <Button 
            onClick={startScanner}
            className="w-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:opacity-90"
          >
            <ScanLine className="h-4 w-4 mr-2" />
            Start Scanning
          </Button>
        )}
        
        {/* Recent scans */}
        {recentScans.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-white/70 mb-2">Recent Scans</h3>
            <ul className="divide-y divide-white/5 rounded-md border border-white/10 overflow-hidden">
              {recentScans.map((scan) => (
                <li key={scan.id} className="bg-zinc-800 hover:bg-zinc-700/50 transition-colors">
                  <button
                    onClick={() => lookupItem(scan.code)}
                    className="w-full px-3 py-2 flex items-center justify-between text-left"
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{scan.code}</p>
                      <p className="text-xs text-white/50">
                        {new Date(scan.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-purple-400" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BarcodeScanner; 