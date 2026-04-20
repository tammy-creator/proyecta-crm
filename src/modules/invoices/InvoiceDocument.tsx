import React from 'react';
import { format, isValid } from 'date-fns';
import type { Invoice } from './types';
import './InvoiceTemplate.css';

import logo from '../../assets/logo.jpg';

interface InvoiceDocumentProps {
    invoice: Invoice;
    patientDetails?: {
        address?: string;
        dni?: string;
        tutorName?: string;
    };
}

const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({ invoice, patientDetails }) => {
    const formatDateSafe = (dateStr: string) => {
        const date = new Date(dateStr);
        return isValid(date) ? format(date, 'dd/MM/yyyy') : 'Fecha inválida';
    };

    return (
        <div className="invoice-print-area printable-document">
            {/* Header: Company Details & Logo */}
            <div className="invoice-header">
                <div className="center-details">
                    <div className="center-name">Centro Infantil Proyecta SL</div>
                    <div className="center-id">B01758515</div>
                    <div className="center-address">C/Alonso de Ojeda, 14, bajo izq.</div>
                    <div className="center-email">centroproyectagijon@gmail.com</div>
                </div>
                <div className="invoice-logo">
                    <img src={logo} alt="Proyecta Logo" />
                </div>
            </div>

            {/* Blue Banner */}
            <div className="invoice-banner">
                <div className="invoice-title">FACTURA {invoice.number}</div>
                <div className="invoice-date">{formatDateSafe(invoice.date)}</div>
            </div>

            {/* Bill To */}
            <div className="bill-to-section">
                <div className="bill-to-label">FACTURAR A</div>
                <div className="bill-to-name">{patientDetails?.tutorName || invoice.patientName}</div>
                {(patientDetails?.dni || patientDetails?.address) && (
                    <div className="bill-to-details">
                        {patientDetails?.dni && <div style={{ marginBottom: '2px' }}>DNI: {patientDetails.dni}</div>}
                        {patientDetails?.address && <div>{patientDetails.address}</div>}
                    </div>
                )}
            </div>

            {/* Items Table */}
            <table className="invoice-items-table">
                <thead>
                    <tr>
                        <th style={{ width: '15%' }}>Cantidad</th>
                        <th>Descripción</th>
                        <th style={{ width: '20%', textAlign: 'right' }}>Precio unitario</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.items.map((item, index) => (
                        <React.Fragment key={index}>
                            <tr>
                                <td style={{ textAlign: 'center' }}>1</td>
                                <td>{item.description}</td>
                                <td style={{ textAlign: 'right' }}>{item.amount.toFixed(2).replace('.', ',')} €</td>
                                <td style={{ textAlign: 'right' }}>{item.amount.toFixed(2).replace('.', ',')} €</td>
                            </tr>
                            {/* Empty rows to simulate paper height if needed, or consistent lines */}
                            <tr>
                                <td style={{ height: '24px' }}></td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr className="concept-row">
                                <td style={{ height: '24px' }}></td>
                                <td className="label-cell">Concepto: {invoice.patientName}</td>
                                <td></td>
                                <td></td>
                            </tr>
                        </React.Fragment>
                    ))}
                    {/* Fillers to maintain table look if desired, but sticking to content for now */}
                </tbody>
            </table>

            {/* Footer: Exemption & Totals */}
            <div className="invoice-footer-area">
                <div className="legal-exemption">
                    Actividad exenta según Ley del IVA
                </div>
                <div className="invoice-totals-wrapper">
                    <table className="invoice-totals-table">
                        <tbody>
                            <tr>
                                <td className="total-label">SUBTOTAL</td>
                                <td className="total-value">{invoice.amount.toFixed(2).replace('.', ',')} €</td>
                            </tr>
                            <tr>
                                <td className="total-label">IMPUESTOS SOBRE LAS VENTAS</td>
                                <td className="total-value">0,00 €</td>
                            </tr>
                            <tr className="final-total-row">
                                <td className="total-label">TOTAL A PAGAR EL {formatDateSafe(invoice.date)}</td>
                                <td className="total-value">{invoice.amount.toFixed(2).replace('.', ',')} €</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="thanks-note">Gracias por ser cliente nuestro.</div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceDocument;
