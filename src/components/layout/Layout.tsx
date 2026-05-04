import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header'; 
import IdentitySelector from '../auth/IdentitySelector';
import './Layout.css';

const Layout: React.FC = () => {
    return (
        <div className="layout-container">
            <IdentitySelector />
            <Sidebar />
            <main className="main-content">
                <Header />
                <div className="content-scrollable">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
