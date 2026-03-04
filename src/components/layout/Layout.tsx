import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header'; // Import the new Header component
import './Layout.css';

const Layout: React.FC = () => {
    // Layout wrapper with Sidebar and Header
    return (
        <div className="layout-container">
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
