import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header'; 
import './Layout.css';

const Layout: React.FC = () => {
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
