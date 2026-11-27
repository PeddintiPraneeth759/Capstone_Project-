import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';

const reportTypes = [
  { value: 'traffic', label: '🚗 Traffic Jam' },
  { value: 'accident', label: '💥 Accident' },
  { value: 'pothole', label: '🕳️ Pothole / Road Damage' },
  { value: 'flood', label: '🌊 Flooding / Waterlogging' },
  { value: 'construction', label: '🚧 Construction Work' },
  { value: 'fallen_tree', label: '🌳 Fallen Tree' },
  { value: 'signal_failure', label: '🚦 Signal Failure' },
  { value: 'protest', label: '📢 Protest / Rally' },
  { value: 'police_diversion', label: '👮 Police Diversion' },
  { value: 'other', label: '❓ Other' },
];

const CommunityReportForm = ({ location, onReportSubmitted }) => {
  const [type, setType] = useState('traffic');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be under 5MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!location) {
      alert("Location is required to submit a report.");
      return;
    }
    
    setIsSubmitting(true);
    setSubmitResult(null);
    
    try {
      let imageUrl = null;

      // Upload image first if selected
      if (imageFile) {
        setUploadingImage(true);
        const formData = new FormData();
        formData.append('image', imageFile);
        try {
          const uploadRes = await api.post('/api/community/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          imageUrl = uploadRes.data.imageUrl;
        } catch (uploadErr) {
          console.error('Image upload failed:', uploadErr);
          setUploadingImage(false);
          setSubmitResult({
            success: false,
            message: uploadErr.response?.data?.message || 'Photo upload failed. Remove the photo or try again.',
          });
          return;
        }
        setUploadingImage(false);
      }

      const response = await api.post('/api/community', {
        type,
        description,
        location: { lat: location.lat, lng: location.lng },
        imageUrl,
      });
      
      setSubmitResult({
        success: true,
        confidence: response.data.aiConfidence,
        status: response.data.status,
      });

      onReportSubmitted(response.data);
      setDescription('');
      removeImage();

      // Auto-hide success message after 4 seconds
      setTimeout(() => setSubmitResult(null), 4000);
    } catch (error) {
      console.error("Error submitting report:", error);
      setSubmitResult({ success: false });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-panel p-6 mt-6"
    >
      <h3 className="text-xl font-bold text-white mb-4 flex items-center">
        <svg className="w-5 h-5 mr-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Report an Issue
      </h3>

      {/* Success/Error Message */}
      <AnimatePresence>
        {submitResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`mb-4 p-3 rounded-xl border text-sm ${
              submitResult.success 
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            {submitResult.success ? (
              <div>
                <p className="font-medium">✓ Report submitted successfully!</p>
                <p className="text-xs mt-1 opacity-80">
                  AI is checking the photo and your matter/reason now. It should finish within 1 minute; real reports then appear in Verified nearby.
                </p>
              </div>
            ) : (
              <p>{submitResult.message || 'Failed to submit report. Please try again.'}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">Issue Type</label>
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-blue-900/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            {reportTypes.map((rt) => (
              <option key={rt.value} value={rt.value}>{rt.label}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">Description</label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly describe the issue..."
            maxLength={1000}
            className="w-full bg-blue-900/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
            required
          />
        </div>

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">Photo (optional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          
          {imagePreview ? (
            <div className="relative rounded-xl overflow-hidden border border-white/10">
              <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover" />
              <button
                type="button"
                onClick={removeImage}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-red-500 transition-colors"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-white/5 border-2 border-dashed border-white/10 rounded-xl p-4 text-center hover:bg-white/10 hover:border-blue-500/30 transition-all text-sm text-gray-400"
            >
              <svg className="w-6 h-6 mx-auto mb-1 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Tap to add a photo
            </button>
          )}
        </div>
        
        <button 
          type="submit" 
          disabled={isSubmitting}
          className={`w-full bg-red-500/80 hover:bg-red-600 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-red-500/20 flex justify-center items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {uploadingImage ? 'Uploading photo...' : isSubmitting ? 'Submitting...' : 'Submit to Community'}
        </button>
      </form>
    </motion.div>
  );
};

export default CommunityReportForm;
