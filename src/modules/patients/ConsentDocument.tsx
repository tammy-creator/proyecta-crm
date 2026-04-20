import React from 'react';
import { type Patient } from './types';
import logoUrl from '../../assets/logo.jpg';

interface ConsentDocumentProps {
    patient: Patient;
    isViewMode: boolean;
    signatureUrl?: string; // Firma del tutor
    therapistSignatureUrl?: string; // Firma del terapeuta
    isSigned: boolean;
    startDrawing?: (e: any) => void;
    draw?: (e: any) => void;
    stopDrawing?: () => void;
    clearSignature?: () => void;
}

const EditableLine: React.FC<{ defaultValue?: string; placeholder?: string; minWidth?: string; fieldId?: string }> = ({ defaultValue = '', placeholder = '', minWidth = '100px', fieldId }) => (
    <span 
        contentEditable={true} 
        suppressContentEditableWarning={true} 
        className="editable-line"
        style={{ minWidth, display: 'inline-block', borderBottom: '1px solid #cbd5e1' }}
        data-placeholder={placeholder}
        data-field-id={fieldId}
    >{defaultValue}</span>
);

const EditableArea: React.FC<{ placeholder?: string; minHeight?: string; fieldId?: string }> = ({ placeholder = '', minHeight = '60px', fieldId }) => (
    <div 
        contentEditable={true} 
        suppressContentEditableWarning={true} 
        className="editable-area"
        style={{ minHeight, border: '1px solid #e2e8f0', padding: '0.5rem', borderRadius: '4px' }}
        data-placeholder={placeholder}
        data-field-id={fieldId}
    ></div>
);

const DocHeader: React.FC<{ title?: React.ReactNode; subtitle?: React.ReactNode }> = ({ title, subtitle }) => (
    <div className="doc-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <img src={logoUrl} alt="Logo Centro Infantil Proyecta" style={{ height: '70px', objectFit: 'contain', marginBottom: '1.5rem' }} />
        {title && <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: subtitle ? '0.2rem' : '0.5rem', color: '#2c3e50', textTransform: 'uppercase' }}>{title}</h1>}
        {subtitle && <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#64748b' }}>{subtitle}</h2>}
    </div>
);

const SignatureBox: React.FC<{
    label: string; 
    name?: string; 
    dni?: string;
    signatureUrl?: string;
    isInteractive?: boolean;
    isViewMode?: boolean;
    isSigned?: boolean;
    startDrawing?: (e: any) => void;
    draw?: (e: any) => void;
    stopDrawing?: () => void;
    clearSignature?: () => void;
    role?: 'tutor' | 'therapist';
}> = ({ label, name, dni, signatureUrl, isInteractive, isSigned, startDrawing, draw, stopDrawing, clearSignature, role = 'tutor' }) => {
    // Estado local para permitir borrar y volver a firmar en modo edición
    const [showCanvas, setShowCanvas] = React.useState(!signatureUrl);

    // Si cambia signatureUrl externamente, actualizamos el estado
    React.useEffect(() => {
        if (!signatureUrl) setShowCanvas(true);
        else setShowCanvas(false);
    }, [signatureUrl]);

    const handleClear = () => {
        if (clearSignature) clearSignature();
        setShowCanvas(true);
    };

    return (
        <div className="signature-area" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', backgroundColor: '#f8fafc', flex: 1 }} data-role={role}>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem', fontWeight: 600 }}>{label}</p>
            
            <p style={{ fontSize: '0.85rem', marginBottom: '1rem', color: '#64748b' }}>
                D./Dª.- {name} <br />
                DNI.- <EditableLine defaultValue={dni} placeholder="................................." minWidth="150px" /> <br/>
                En <EditableLine defaultValue="Gijón" minWidth="100px" />, a <EditableLine defaultValue={new Date().getDate().toString()} minWidth="30px" /> de <EditableLine defaultValue={["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][new Date().getMonth()]} minWidth="80px" /> de 20<EditableLine defaultValue={new Date().getFullYear().toString().substring(2)} minWidth="30px" />
            </p>

            <div className="signature-pad-container" style={{ position: 'relative', border: '2px dashed #cbd5e1', height: '140px', backgroundColor: 'white', borderRadius: '8px', cursor: isInteractive ? 'crosshair' : 'default' }}>
                {signatureUrl && !showCanvas ? (
                    <img src={signatureUrl} alt="Firma" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }} />
                ) : isInteractive ? (
                    <canvas
                        className={`signature-pad-canvas signature-role-${role}`}
                        width="600" height="140"
                        style={{ width: '100%', height: '100%', borderRadius: '8px' }}
                        data-role={role}
                        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                    />
                ) : null}
                
                {isInteractive && (
                    <button 
                        className="btn-icon micro" 
                        onClick={handleClear} 
                        style={{ position: 'absolute', top: '8px', right: '8px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', zIndex: 5 }} 
                        title="Borrar firma"
                    >×</button>
                )}
                {isInteractive && !isSigned && showCanvas && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#94a3b8', pointerEvents: 'none', fontSize: '0.9rem', fontWeight: 500 }}>Firme dentro de este recuadro</div>
                )}
            </div>
        </div>
    );
};

const ConsentDocument: React.FC<ConsentDocumentProps> = ({ 
    patient, isViewMode, signatureUrl, therapistSignatureUrl, isSigned,
    startDrawing, draw, stopDrawing, clearSignature
}) => {
    const today = new Date();
    const day = today.getDate().toString();
    const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const month = monthNames[today.getMonth()];
    const yearStr = today.getFullYear().toString();
    const calculatedAge = React.useMemo(() => {
        if (!patient?.birthDate) return patient?.age?.toString() || '';
        const today = new Date();
        const birth = new Date(patient.birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age.toString();
    }, [patient?.birthDate, patient?.age]);

    return (
        <div className="consent-document printable-document">
            {/* PAGINA 1: FICHA DE INSCRIPCIÓN (DATOS) */}
            <div className="doc-page">
                <DocHeader title="FICHA DE INSCRIPCIÓN" />

                <section style={{ marginBottom: '2rem' }}>
                    <h4 style={{ borderBottom: '2px solid #3498db', paddingBottom: '0.3rem', marginBottom: '1rem', color: '#2980b9' }}>DATOS DEL ALUMNO/A</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 2fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <p><strong>NOMBRE:</strong> {patient?.firstName || ''}</p>
                        <p><strong>APELLIDOS:</strong> {patient?.lastName || ''}</p>
                        <p><strong>EDAD:</strong> {calculatedAge}</p>
                        <p><strong>FECHA DE NACIMIENTO:</strong> {patient?.birthDate ? new Date(patient.birthDate).toLocaleDateString() : ''}</p>
                        <p style={{ gridColumn: '1 / -1' }}><strong>DOMICILIO:</strong> {patient?.address || ''}</p>
                        <p style={{ gridColumn: '1 / -1' }}><strong>COLEGIO:</strong> <EditableLine defaultValue={patient?.schooling === "No escolarizado" ? "" : patient?.schooling} placeholder="Nombre del colegio..." minWidth="200px" fieldId="school_name" /></p>
                        <p style={{ gridColumn: '1 / -1' }}><strong>ETAPA DE ESCOLARIZACIÓN:</strong> <EditableLine defaultValue={patient?.schooling} placeholder="Etapa..." minWidth="150px" fieldId="school_stage" /></p>
                    </div>
                </section>

                <section style={{ marginBottom: '2rem' }}>
                    <h4 style={{ borderBottom: '2px solid #3498db', paddingBottom: '0.3rem', marginBottom: '1rem', color: '#2980b9' }}>DATOS FAMILIARES</h4>
                    <div style={{ marginBottom: '1rem' }}>
                        <p style={{ fontWeight: 600, fontStyle: 'italic', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Padre / Madre / Tutor 1</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 2fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <p><strong>NOMBRE:</strong> {patient.tutor1?.firstName}</p>
                            <p><strong>APELLIDOS:</strong> {patient.tutor1?.lastName}</p>
                            <p><strong>DNI:</strong> {patient.tutor1?.dni}</p>
                            <p><strong>PROFESIÓN:</strong> {patient.tutor1?.job}</p>
                            <p style={{ gridColumn: '1 / -1' }}><strong>TELÉFONOS DE CONTACTO:</strong> {patient.tutor1?.phone}</p>
                        </div>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ fontWeight: 600, fontStyle: 'italic', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Padre / Madre / Tutor 2</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 2fr', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <p><strong>NOMBRE:</strong> {patient.tutor2?.firstName}</p>
                            <p><strong>APELLIDOS:</strong> {patient.tutor2?.lastName}</p>
                            <p><strong>DNI:</strong> {patient.tutor2?.dni}</p>
                            <p><strong>PROFESIÓN:</strong> {patient.tutor2?.job}</p>
                            <p style={{ gridColumn: '1 / -1' }}><strong>TELÉFONOS DE CONTACTO:</strong> {patient.tutor2?.phone}</p>
                        </div>
                    </div>
                </section>

                <section style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ borderBottom: '2px solid #3498db', paddingBottom: '0.3rem', marginBottom: '1rem', color: '#2980b9' }}>DATOS DE INTERÉS</h4>
                    <div style={{ fontSize: '0.85rem' }}>
                        <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>¿Presenta alguna alergia y/o intolerancia alimenticia?</p>
                        <p style={{ marginBottom: '1.5rem', fontStyle: 'italic' }}><EditableLine defaultValue={patient.allergies} placeholder="Especifique alergias o intolerancias..." minWidth="100%" fieldId="allergies_detail" /></p>
                        <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>¿CÓMO NOS CONOCISTE?</p>
                        <p style={{ fontStyle: 'italic' }}><EditableLine defaultValue={patient.referralSource} placeholder="Especifique cómo nos ha conocido..." minWidth="100%" fieldId="referral_detail" /></p>
                    </div>
                </section>


            </div>

            <hr className="page-divider" style={{ border: 'none', borderTop: '2px dashed #cbd5e1', margin: '3rem 0' }} />

            {/* PAGINA 2: FICHA DE INSCRIPCIÓN (RGPD Y FIRMAS) */}
            <div className="doc-page">
                <section style={{ fontSize: '0.8rem', color: '#475569', textAlign: 'justify', lineHeight: '1.6', marginBottom: '3rem' }}>
                    <p style={{ marginBottom: '1rem' }}>En cumplimiento de lo establecido en el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y a la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales, le informamos de que los datos facilitados por usted, así como los que se generen durante su relación con nuestra entidad, serán objeto de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gestión administrativa derivada de nuestra relación contractual, así como enviarle comunicaciones comerciales sobre nuestros servicios.</p>
                    <p style={{ marginBottom: '1rem' }}>La legitimación del tratamiento será en base al vínculo contractual existente, consentimiento, o bien por interés legítimo (mercadotecnia directa) u obligación legal, en algunos casos. Los datos proporcionados se conservarán mientras se mantenga la relación contractual o durante el tiempo necesario para cumplir con las obligaciones legales. No se cederán sus datos a terceros, salvo que sea necesario para la prestación de servicios o haya una obligación legal. No se tomarán decisiones automatizadas con efectos jurídicos significativos, salvo que se haya obtenido previamente el consentimiento.</p>
                    <p style={{ marginBottom: '1rem' }}>Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado. Para ello podrá enviar un email a: dpdcentroproyecta@gmail.com, adjuntando copia de su DNI. Además, puede dirigirse a la Autoridad de Control en materia de Protección de Datos competente (AEPD, en España) para obtener información adicional o presentar una reclamación.</p>
                    <p style={{ marginBottom: '2rem' }}><strong>Datos identificativos del responsable:</strong><br/>Centro Infantil Proyecta, S.L., B01758515, C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, 647 257 447</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
                        <div style={{ width: '16px', height: '16px', border: '1px solid #10b981', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✓</div>
                        <strong style={{ color: '#10b981' }}>He leído y acepto las condiciones de tratamiento y protección de datos.</strong>
                    </div>
                </section>
                <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <SignatureBox 
                        label="Firma 1:" 
                        name={`${patient.tutor1?.firstName} ${patient.tutor1?.lastName}`} 
                        dni={patient.tutor1?.dni} 
                        signatureUrl={signatureUrl}
                        isInteractive={true}
                        isViewMode={isViewMode}
                        isSigned={isSigned}
                        startDrawing={startDrawing}
                        draw={draw}
                        stopDrawing={stopDrawing}
                        clearSignature={clearSignature}
                    />
                    <SignatureBox 
                        label="Firma 2:" 
                        name={`${patient.tutor2?.firstName || '..........................'} ${patient.tutor2?.lastName || ''}`} 
                        dni={patient.tutor2?.dni} 
                        signatureUrl={patient.tutor2?.firstName ? signatureUrl : undefined}
                        isInteractive={true}
                        isViewMode={isViewMode}
                        isSigned={isSigned}
                        startDrawing={startDrawing}
                        draw={draw}
                        stopDrawing={stopDrawing}
                        clearSignature={clearSignature}
                    />
                </div>
            </div>

            <hr className="page-divider" style={{ border: 'none', borderTop: '2px dashed #cbd5e1', margin: '3rem 0' }} />

            {/* PAGINA 3: CONSENTIMIENTO INFORMADO */}
            <div className="doc-page">
                <DocHeader title="CONSENTIMIENTO INFORMADO" />
                <section style={{ fontSize: '0.85rem', color: '#334155', textAlign: 'justify', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '1rem' }}>En cumplimiento de lo establecido en el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y en la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales (LOPD y GDD), le informamos de que los datos de carácter personal por usted facilitados, relativos a sus hijos o tutelados, así como los que se generen durante su relación o la de los menores con nuestra entidad, serán objeto de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gestión administrativa derivada de nuestra relación contractual, así como enviarle comunicaciones comerciales sobre nuestros servicios. Solo serán solicitados aquellos datos estrictamente necesarios para gestionar las finalidades descritas, pudiendo ser necesario recoger datos de contacto de terceros, tales como representantes legales, tutores, o personas a cargo designadas por los mismos.</p>
                    <p style={{ marginBottom: '1rem' }}>Como obliga el RGPD, la legitimación del tratamiento de los datos personales de menores será en base al consentimiento de sus padres o tutores. Los datos proporcionados se conservarán mientras se mantenga la relación contractual, o durante el tiempo necesario para cumplir con las obligaciones legales. Todos los datos recogidos cuentan con el compromiso de estricta confidencialidad, y con las medidas de seguridad establecidas legalmente. Bajo ningún concepto serán cedidos o tratados por terceras personas, físicas o jurídicas, sin el previo consentimiento del tutor o representante legal, salvo en aquellos casos en que sea necesario para el desarrollo, cumplimiento y control de la relación entidad-paciente y prestación de servicios derivada de la misma o en los supuestos en que lo autorice una norma con rango de ley. En este sentido, sus datos podrán ser cedidos, sin carácter limitativo o excluyente, a la Administración Tributaria, organismos de la Seguridad Social o entidades sanitarias, entidades financieras (para cobro de los servicios) o gestoría administrativa (para la realización de la contabilidad y declaración de impuestos).</p>
                    <p style={{ marginBottom: '1rem' }}>Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales y/o los de sus hijos o tutelados: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado. Para ello, podrá enviar un email a dpdcentroproyecta@gmail.com, o bien dirigir un escrito a Centro Infantil Proyecta, S.L., C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, adjuntando copia de su DNI. Además, el interesado puede dirigirse a la Autoridad de Control en materia de Protección de Datos competente (AEPD, en España) para obtener información adicional o presentar una reclamación.</p>
                    <p style={{ marginBottom: '2rem' }}>En base a lo indicado en párrafos anteriores, el padre, madre o tutor/a legal del menor autoriza expresamente a Centro Infantil Proyecta, S.L. al tratamiento de datos especialmente protegidos para la/s finalidad/es descritas en párrafos anteriores. Tenga en cuenta que la negativa al tratamiento o cesión de los datos contratado llevaría aparejada la imposibilidad del mantenimiento y cumplimiento de la relación entidad-paciente.</p>
                </section>
                <SignatureBox 
                    label="Firma del Padre, Madre o Tutor/a Legal:" 
                    name={`${patient.tutor1?.firstName} ${patient.tutor1?.lastName}`}
                    dni={patient.tutor1?.dni}
                    signatureUrl={signatureUrl}
                    isInteractive={true}
                    isViewMode={isViewMode}
                    isSigned={isSigned}
                    startDrawing={startDrawing}
                    draw={draw}
                    stopDrawing={stopDrawing}
                    clearSignature={clearSignature}
                />
            </div>
            
            <hr className="page-divider" style={{ border: 'none', borderTop: '2px dashed #cbd5e1', margin: '3rem 0' }} />

            {/* PAGINA 4: DERECHO DE INFORMACIÓN */}
            <div className="doc-page">
                <DocHeader title="DERECHO DE INFORMACIÓN" subtitle="(COPIA PARA LA FAMILIA)" />
                <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#f1f5f9', borderRadius: '8px', fontSize: '0.85rem', color: '#334155' }}>
                    <strong style={{ color: '#0f172a' }}>Datos del responsable del tratamiento:</strong><br />
                    Centro Infantil Proyecta, S.L.<br />
                    B01758515<br />
                    C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS<br />
                    647 257 447
                </div>
                <section style={{ fontSize: '0.85rem', color: '#334155', textAlign: 'justify', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '1rem' }}>En cumplimiento de lo establecido en el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y en la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales (LOPD y GDD), le informamos que sus datos serán incorporados en nuestro sistema de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gestión administrativa derivada de nuestra relación contractual, así como enviarle comunicaciones comerciales sobre nuestros servicios. Solo serán solicitados aquellos datos que sean pertinentes, necesarios, adecuados y no excesivos, pudiendo ser necesario recoger datos de contacto de terceros, tales como representantes legales, tutores, o personas a cargo designadas por los mismos.</p>
                    <p style={{ marginBottom: '1rem' }}>La legitimación del tratamiento de sus datos, con carácter general, será en base a un vínculo contractual, consentimiento, interés legítimo u obligación legal. Los datos proporcionados se conservarán mientras se mantenga la relación contractual, o durante el tiempo necesario para cumplir con las obligaciones legales. Los datos no se cederán a terceros salvo en los casos en que exista una obligación legal, o sea necesario para la ejecución de un contrato.</p>
                    <p style={{ marginBottom: '2rem' }}>Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado. Para ello podrá enviar un email a dpdcentroproyecta@gmail.com, o bien dirigir un escrito a Centro Infantil Proyecta, S.L. C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, adjuntando copia de su DNI. Además, puede dirigirse a la Autoridad de Control en materia de Protección de Datos competente (AEPD, en España) para obtener información adicional o presentar una reclamación.</p>
                </section>
            </div>

            <hr className="page-divider" style={{ border: 'none', borderTop: '2px dashed #cbd5e1', margin: '3rem 0' }} />

            {/* PAGINA 5: CIRCULAR INFORMATIVA */}
            <div className="doc-page">
                <DocHeader />
                <div style={{ marginBottom: '3rem', fontSize: '0.85rem', color: '#475569' }}>
                    Centro Infantil Proyecta, S.L.<br />
                    B01758515<br />
                    C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS<br />
                    647 257 447
                </div>
                <section style={{ fontSize: '0.85rem', color: '#334155', textAlign: 'justify', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Estimado cliente,</p>
                    <p style={{ marginBottom: '1.5rem' }}>La presente circular tiene por objeto poner en su conocimiento que hemos implantado las medidas de seguridad técnicas y organizativas necesarias para garantizar la seguridad de los datos de carácter personal que almacenamos, de acuerdo con el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales.</p>
                    <p style={{ marginBottom: '1rem', fontWeight: 600 }}>Es nuestro deber informarle que, como consecuencia de la relación comercial que nos une:</p>
                    <ul style={{ paddingLeft: '2rem', marginBottom: '1.5rem', listStyleType: 'disc' }}>
                        <li style={{ marginBottom: '0.5rem' }}>Sus datos están incluidos en nuestro sistema de tratamiento, con la finalidad de realizar la gestión administrativa, contable, fiscal y realizar el envío de información comercial sobre nuestros productos o servicios.</li>
                        <li style={{ marginBottom: '0.5rem' }}>Los tratamos en base por ejecución de un contrato, si bien es cierto que, en algunos casos, la base jurídica será su consentimiento previo, la existencia de un interés legítimo, o por obligación legal.</li>
                        <li style={{ marginBottom: '0.5rem' }}>No tomaremos decisiones automatizadas con efectos jurídicos significativos en base a dichos tratamientos, salvo que se haya obtenido previamente el consentimiento.</li>
                        <li style={{ marginBottom: '0.5rem' }}>Los datos proporcionados se conservarán mientras se mantenga la relación comercial o durante los años necesarios para cumplir con las obligaciones legales y no se cederán a terceros salvo en los casos en que exista una obligación legal.</li>
                    </ul>
                    <p style={{ marginBottom: '1.5rem' }}>Centro Infantil Proyecta, S.L. se compromete a cumplir con lo dispuesto por la normativa sobre protección de datos anteriormente mencionada, así como a hacer cumplir las medidas de seguridad técnicas y organizativas implantadas al personal a su servicio que trate datos de carácter personal, evitando de esta forma, la pérdida alteración y acceso no autorizado a los mismos. Dicho personal se halla sujeto al deber de secreto y confidencialidad respecto a los datos que trata en los mismos términos que Centro Infantil Proyecta, S.L.</p>
                    <p style={{ marginBottom: '1.5rem' }}>Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado.</p>
                    <p style={{ marginBottom: '1.5rem' }}>Para ello podrá enviar un email, debidamente identificado, a: <strong>dpdcentroproyecta@gmail.com</strong> o dirigir un escrito a Centro Infantil Proyecta, S.L. C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS</p>
                    <p style={{ marginBottom: '2rem' }}>Además, el interesado puede dirigirse a la Autoridad de Control en materia de Protección de Datos competente (la AEPD, en España) para obtener información adicional o presentar una reclamación.</p>
                    <p style={{ marginBottom: '1rem' }}>Sin otro particular, reciba un cordial saludo.</p>
                </section>
            </div>

            <hr className="page-divider" style={{ border: 'none', borderTop: '2px dashed #cbd5e1', margin: '3rem 0' }} />

            {/* PAGINA 6: CONTRATO TERAPÉUTICO */}
            <div className="doc-page">
                <DocHeader title="CONTRATO TERAPÉUTICO" />
                <section style={{ fontSize: '0.85rem', color: '#334155', textAlign: 'justify', lineHeight: '1.6' }}>
                     <p style={{ marginBottom: '1.5rem', lineHeight: '2' }}>
                        D./Dña <EditableLine defaultValue={`${patient.tutor1?.firstName} ${patient.tutor1?.lastName}`} minWidth="250px" fieldId="contract_tutor_name" /> mayor de edad, con domicilio en <EditableLine defaultValue={patient.address} placeholder="..................................." minWidth="200px" fieldId="contract_address" /> con DNI <EditableLine defaultValue={patient.tutor1?.dni} minWidth="150px" fieldId="contract_dni" /> en condición de padre/madre/tutor legal del/la menor <EditableLine defaultValue={`${patient.firstName} ${patient.lastName}`} minWidth="250px" fieldId="contract_minor_name" />
                     </p>
                     
                     <h5 style={{ textAlign: 'center', marginBottom: '1rem', fontWeight: 600 }}>MANIFIESTA</h5>
                     <p style={{ marginBottom: '1rem' }}>Que para garantizar el correcto desarrollo y eficacia de la terapia es importante obtener el compromiso de ambas partes y, por ello, acepta:</p>
                     
                     <ul style={{ paddingLeft: '1.5rem', marginBottom: '1.5rem', listStyleType: 'disc' }}>
                         <li style={{ marginBottom: '1rem' }}>
                            Que su hijo/a asista de manera regular a las sesiones programadas. En caso de que le sea imposible acudir, deberá notificarlo con un mínimo de 24 horas de antelación. Esa sesión podrá reagendarse bajo disponibilidad del terapeuta y en caso de no disfrutarse, no será abonada.<br/>
                            Si avisa en un período inferior al mencionado sin causa justificada (*) o si no se presenta a su cita, se dará la sesión por disfrutada y deberá abonarse cuando acuda a la próxima cita.<br/>
                            <span style={{ fontSize: '0.8rem' }}>(*) Enfermedad justificada y/o urgencia familiar.</span>
                         </li>
                         <li style={{ marginBottom: '1rem' }}>
                            Que su hijo/a acuda a las sesiones en el horario pactado con el terapeuta. En caso de no llegar puntual a la cita, la hora de finalización será la acordada.<br/>
                            Si tiene cita a las 15:00 y llega al centro 15 minutos tarde, la sesión finalizará a las 16:00 ya que, a continuación, hay otro paciente.
                         </li>
                         <li style={{ marginBottom: '1rem' }}>
                            Que cualquier información, comentarios o dudas deberán ser en su hora de sesión y no en la recogida, ya que a continuación, el terapeuta tiene otro paciente.
                         </li>
                         <li style={{ marginBottom: '1rem' }}>
                            Que, en caso de necesitar un informe, éste deberá solicitarse mínimo con 1 semana de antelación a la fecha de entrega. De no ser así, la entrega en la fecha solicitada quedará a disposición de la disponibilidad de su terapeuta.<br/>
                            El precio de los informes será de <u>40 euros</u>.<br/>
                            Se puede solicitar un informe de seguimiento una vez al año que se incluye dentro del precio de la terapia.
                         </li>
                         <li style={{ marginBottom: '1rem' }}>
                            Que, para comunicarse con el terapeuta, deberá hacerlo a través de WhatsApp (por escrito) o correo electrónico ya que, durante nuestra jornada laboral, no tenemos disponibilidad para hablar por teléfono a no ser que se agende una cita telefónica que contará como una sesión de terapia.
                         </li>
                         <li style={{ marginBottom: '1rem' }}>
                            Que las sesiones deberán abonarse al inicio de la sesión o la mensualidad por adelantado (efectivo, tarjeta o transferencia bancaria) a no ser que se haya acordado otra modalidad de pago.
                         </li>
                         <li style={{ marginBottom: '1rem' }}>
                            Que, en caso de necesitar factura de las sesiones, éstas deberán solicitarse con antelación y se entregarán dentro de los primeros quince días del mes siguiente (*).<br/><br/>
                            <span style={{ fontSize: '0.8rem' }}>*Alumnos que hayan solicitado beca NEAE se entregarán todas las facturas al finalizar el curso académico.</span>
                         </li>
                     </ul>
                     
                     <div style={{ textAlign: 'center', marginTop: '3rem', marginBottom: '3rem' }}>
                         En <EditableLine defaultValue="Gijón" minWidth="150px" fieldId="contract_city" /> , a <EditableLine defaultValue={day} minWidth="40px" fieldId="contract_day" /> de <EditableLine defaultValue={month} minWidth="120px" fieldId="contract_month" /> de {yearStr}
                     </div>
                     
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '0.8rem', fontStyle: 'italic', marginTop: '2rem' }}>
                         <div>
                             Centro Infantil Proyecta S.L<br/>
                             C/ Alonso Ojeda 14 bajo izq<br/>
                             33208 Gijón, Asturias
                         </div>
                         <div style={{ textAlign: 'right' }}>
                             Teléfono: 684653227<br/>
                             e-mail: centroproyectagijon@gmail.com<br/>
                             www.centroproyecta.es
                         </div>
                     </div>

                     <div style={{ marginTop: '3rem' }}>
                          <SignatureBox 
                              label="Firma del Tutor/a (Aceptación de Contrato):" 
                              name={`${patient.tutor1?.firstName} ${patient.tutor1?.lastName}`}
                              dni={patient.tutor1?.dni}
                              signatureUrl={signatureUrl}
                              isInteractive={true}
                              isViewMode={isViewMode}
                              startDrawing={startDrawing}
                              draw={draw}
                              stopDrawing={stopDrawing}
                              clearSignature={clearSignature}
                          />
                      </div>
                </section>
            </div>

            <hr className="page-divider" style={{ border: 'none', borderTop: '2px dashed #cbd5e1', margin: '3rem 0' }} />

            {/* PAGINA 7: HISTORIA CLÍNICA (PAGE 1) */}
            <div className="doc-page" style={{ minHeight: '800px' }}>
                <DocHeader title="HISTORIA CLÍNICA" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '3rem', fontSize: '0.9rem' }}>
                    <div><strong>Entrevistador:</strong> <EditableLine placeholder="Nombre del entrevistador..." minWidth="200px" fieldId="interviewer" /></div>
                    <div><strong>Fecha 1ra Consulta:</strong> <EditableLine defaultValue={today.toLocaleDateString('es-ES')} minWidth="120px" fieldId="first_consult_date" /></div>
                </div>
                <section style={{ marginBottom: '3rem' }}>
                    <h4 style={{ fontSize: '1.05rem', color: '#2c3e50', marginBottom: '1rem' }}>I. DATOS PERSONALES</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                        <div><strong>Nombre:</strong> {patient.firstName} {patient.lastName}</div>
                        <div><strong>Edad:</strong> <EditableLine defaultValue={calculatedAge} placeholder="......" minWidth="40px" /></div>
                    </div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}><strong>Fecha y lugar de nacimiento:</strong> <EditableLine defaultValue={patient.birthDate ? new Date(patient.birthDate).toLocaleDateString() : ''} placeholder="……………………………………………" minWidth="250px" /></div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}><strong>Telf de contacto:</strong> <EditableLine defaultValue={patient.phone} placeholder="………………………" minWidth="150px" /></div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}><strong>Etapa educativa:</strong> <EditableLine defaultValue={patient.schooling} placeholder="………………………" minWidth="150px" /></div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}><strong>Informante:</strong> <EditableLine placeholder="…………………………………………………………" minWidth="300px" fieldId="informant" /></div>
                </section>
                <section style={{ marginBottom: '3rem' }}>
                    <h4 style={{ fontSize: '1.05rem', color: '#2c3e50', marginBottom: '1rem' }}>II. MOTIVO DE CONSULTA</h4>
                    <EditableArea placeholder="Escriba motivo de consulta..." minHeight="80px" fieldId="consult_reason" />
                </section>
                <section style={{ marginBottom: '3rem' }}>
                    <h4 style={{ fontSize: '1.05rem', color: '#2c3e50', marginBottom: '1rem' }}>III. ANTECEDENTES FAMILIARES</h4>
                    <EditableArea placeholder="Escriba antecedentes familiares..." minHeight="80px" fieldId="family_history" />
                </section>
                <section style={{ marginBottom: '3rem' }}>
                    <h4 style={{ fontSize: '1.05rem', color: '#2c3e50', marginBottom: '1rem' }}>IV. VALORACIÓN DEL DESARROLLO/MOMENTO ACTUAL</h4>
                    <EditableArea placeholder="Escriba valoración de desarrollo..." minHeight="150px" fieldId="development_assessment" />
                </section>
            </div>
            
            <hr className="page-divider" style={{ border: 'none', borderTop: '2px dashed #cbd5e1', margin: '3rem 0' }} />
            
            {/* PAGINA 8: HISTORIA CLÍNICA (PAGE 2) */}
            <div className="doc-page" style={{ minHeight: '600px' }}>
                <section style={{ marginBottom: '5rem' }}>
                    <h4 style={{ fontSize: '1.05rem', color: '#2c3e50', marginBottom: '1rem' }}>V. IMPRESIÓN DIAGNÓSTICA/DIAGNÓSTICO PROPUESTO</h4>
                    <EditableArea placeholder="Escriba los detalles de impresión diagnóstica..." minHeight="200px" fieldId="diagnostic_impression" />
                </section>
                <section style={{ marginBottom: '5rem' }}>
                    <h4 style={{ fontSize: '1.05rem', color: '#2c3e50', marginBottom: '1rem' }}>VI. EVOLUCIÓN</h4>
                    <EditableArea placeholder="Escriba el seguimiento y evolución..." minHeight="200px" fieldId="evolution_followup" />
                </section>
                <section style={{ marginBottom: '5rem' }}>
                    <h4 style={{ fontSize: '1.05rem', color: '#2c3e50', marginBottom: '1rem' }}>VII. ALTA</h4>
                    <EditableArea placeholder="Escriba las condiciones del alta..." minHeight="150px" fieldId="discharge_notes" />
                </section>
                <div style={{ marginTop: '3rem' }}>
                    <SignatureBox 
                        label="Firma responsable del centro / Terapeuta:" 
                        name="Centro Infantil Proyecta"
                        dni="B01758515"
                        signatureUrl={therapistSignatureUrl}
                        isInteractive={true}
                        isViewMode={isViewMode}
                        isSigned={isSigned}
                        startDrawing={startDrawing}
                        draw={draw}
                        stopDrawing={stopDrawing}
                        clearSignature={clearSignature}
                        role="therapist"
                    />
                </div>
            </div>
        </div>
    );
};

export default ConsentDocument;
