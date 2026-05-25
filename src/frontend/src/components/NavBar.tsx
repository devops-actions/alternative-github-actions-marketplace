import React from 'react';
import { NavLink } from 'react-router-dom';

export const NavBar: React.FC = () => {
  return (
    <nav className="nav-bar">
      <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : undefined}>
        Marketplace
      </NavLink>
      <NavLink to="/state" className={({ isActive }) => isActive ? 'active' : undefined}>
        State of Actions
      </NavLink>
      <NavLink to="/status" className={({ isActive }) => isActive ? 'active' : undefined}>
        Data Status
      </NavLink>
    </nav>
  );
};
