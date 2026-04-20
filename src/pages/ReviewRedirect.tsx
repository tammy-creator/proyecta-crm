import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { markReviewClicked } from '../modules/patients/service';

const ReviewRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    const processRedirect = async () => {
      try {
        if (id) {
          // Marcar en Supabase que el paciente ha hecho clic en la reseña
          await markReviewClicked(id);
        }
      } catch (error) {
        console.error('Error recording review click:', error);
      } finally {
        // Redirigir a la URL de reseñas de Google configurada, incluso si falla la BD
        const googleReviewUrl = import.meta.env.VITE_GOOGLE_REVIEW_URL;
        if (googleReviewUrl) {
          window.location.replace(googleReviewUrl);
        } else {
          console.error("VITE_GOOGLE_REVIEW_URL is not defined in the environment.");
          // Redirect to home as fallback
          window.location.replace('/');
        }
      }
    };

    processRedirect();
  }, [id]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f4f8'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid #bce4ea',
          borderTopColor: '#1A5F7A',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
          margin: '0 auto 1rem'
        }} />
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Redirigiendo a las reseñas...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
};

export default ReviewRedirect;
