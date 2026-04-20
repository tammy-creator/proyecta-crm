import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PrintPortalProps {
    children: React.ReactNode;
}

const PrintPortal: React.FC<PrintPortalProps> = ({ children }) => {
    const [container, setContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        let el = document.getElementById('print-root');
        if (!el) {
            el = document.createElement('div');
            el.id = 'print-root';
            document.body.appendChild(el);
        }
        el.classList.add('visible');
        setContainer(el);

        return () => {
            el?.classList.remove('visible');
        };
    }, []);


    if (!container) return null;

    return createPortal(children, container);
};

export default PrintPortal;
