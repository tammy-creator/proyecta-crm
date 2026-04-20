import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './useToast';
import { useAuth } from '../context/AuthContext';

export const useRealtimeNotifications = () => {
    const { user, isRole } = useAuth();
    const { showToast } = useToast();

    const playNotificationSound = () => {
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
            oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5); // Slide to A4

            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    };

    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('system_notifications_changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'system_notifications'
                },
                (payload) => {
                    const newNotif = payload.new;
                    
                    // Filter: Only if it's for me or I am Admin and it's for Admins
                    const isForMe = newNotif.user_id === user.id;
                    const isForMyRole = (newNotif.role_target === 'ADMIN' && isRole('ADMIN')) || 
                                       (newNotif.role_target === 'THERAPIST' && isRole('THERAPIST')) ||
                                       (newNotif.role_target === 'ALL');

                    if (isForMe || isForMyRole) {
                        // 1. Play Sound
                        playNotificationSound();

                        // 2. Show Toast
                        showToast(`${newNotif.title}: ${newNotif.message}`, 'info');

                        // 3. Refresh Calendar (Global Event)
                        window.dispatchEvent(new CustomEvent('calendar-refresh'));
                        
                        // 4. Update Notification Count (Custom Event for Header)
                        window.dispatchEvent(new CustomEvent('notification-refresh'));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, isRole, showToast]);
};
