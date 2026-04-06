import os
from datetime import datetime
from fpdf import FPDF, XPos, YPos

class PDF(FPDF):
    def header(self):
        # Logo
        header_y_start = 10
        logo_width = 20
        logo_height = 20 # Assuming a square logo or proportional height around this value
        logo_x_pos = 10

        self.set_y(header_y_start)
        logo_path = "/app/data/images/logo.png"
        if os.path.exists(logo_path):
            try:
                self.image(logo_path, x=logo_x_pos, y=header_y_start, w=logo_width, h=logo_height)
            except Exception:
                pass # Fallback gracefully if image is corrupted
        
        # Title
        self.set_font("helvetica", 'B', 24)
        self.set_text_color(30, 58, 138) # Darker blue for title

        # Calculate vertical position for the title to be aligned with the logo
        title_y_pos = header_y_start + (logo_height / 2) - (10 / 2) # Vertically center title (10mm height) with logo
        
        # Set Y position and draw the title, centered on the page
        self.set_y(title_y_pos)
        self.cell(0, 10, "Disk Erasure Report", align='C')
        
        # Move cursor down for separator, below logo + padding
        self.set_y(header_y_start + logo_height + 5) # Move cursor down for separator, below logo + padding
        
        # Thick separator line
        self.set_draw_color(30, 58, 138) # Darker blue line
        self.set_line_width(1.5)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", 'I', 8)
        self.set_text_color(100, 100, 100) # Grey text
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align='C')
        self.set_x(self.l_margin)
        self.cell(0, 10, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", align='R')

    def section_title(self, title):
        self.set_fill_color(220, 230, 240) # Light blue background
        self.set_text_color(30, 58, 138) # Darker blue text
        self.set_font("helvetica", 'B', 14)
        self.cell(0, 10, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
        self.ln(5)
        self.set_text_color(0, 0, 0) # Reset text color to black

    def key_value_pair(self, key, value, key_width=40, value_width=0):
        self.set_font("helvetica", '', 10)
        self.cell(key_width, 7, key)
        self.set_font("helvetica", 'B', 10)
        self.multi_cell(value_width, 7, str(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("helvetica", '', 10) # Reset font

def generate_erasure_certificate(reports_dir: str, drive_name: str, serial: str, method: str, verify: str, start_time: str, end_time: str, server_name: str, inventory_id: str, datacenter: str, comp_name: str, comp_address: str, comp_phone: str):
    filename = f"Certificate_{drive_name}_{serial}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath = os.path.join(reports_dir, filename)

    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.alias_nb_pages() # For {nb} in footer
    
    # --- Section 1: Organization ---
    pdf.section_title("Organisation Performing The Disk Erasure")
    pdf.key_value_pair("Business Name:", comp_name, key_width=40, value_width=150)
    pdf.key_value_pair("Address:", comp_address, key_width=40, value_width=150)
    pdf.key_value_pair("Contact Phone:", comp_phone, key_width=40, value_width=150)
    pdf.ln(10)

    # --- Section 2: Disk Information ---
    pdf.section_title("Disk Information")
    pdf.key_value_pair("Target Drive:", drive_name, key_width=40, value_width=150)
    pdf.key_value_pair("Serial Number:", serial, key_width=40, value_width=150)
    pdf.key_value_pair("Datacenter:", datacenter, key_width=40, value_width=150)
    pdf.key_value_pair("Server Name:", server_name, key_width=40, value_width=150)
    pdf.key_value_pair("Inventory ID:", inventory_id, key_width=40, value_width=150)
    pdf.ln(10)

    # --- Section 3: Erasure Details ---
    pdf.section_title("Disk Erasure Details")
    pdf.key_value_pair("Start Time:", start_time, key_width=40, value_width=150)
    pdf.key_value_pair("End Time:", end_time, key_width=40, value_width=150)
    pdf.key_value_pair("Method:", method.upper(), key_width=40, value_width=150)
    
    pdf.set_font("helvetica", '', 10)
    pdf.cell(40, 7, "Status:")
    pdf.set_font("helvetica", 'B', 12)
    pdf.set_text_color(34, 197, 94) # Tailwind green-500
    pdf.cell(0, 7, "ERASED", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(0, 0, 0) # Reset text color
    
    pdf.key_value_pair("Verification:", verify.upper(), key_width=40, value_width=150)
    pdf.ln(10)

    # --- Section 4: Technician ---
    pdf.section_title("Technician/Operator")
    pdf.key_value_pair("Name/ID:", "Disk Hunter Appliance", key_width=40, value_width=150)
    
    pdf.set_font("helvetica", '', 10)
    pdf.cell(40, 15, "Signature:")
    pdf.set_x(pdf.get_x() + 10) # Move a bit right for the line
    pdf.line(pdf.get_x(), pdf.get_y() + 10, pdf.get_x() + 80, pdf.get_y() + 10) # Signature line
    pdf.ln(20) # Move down after signature line
    
    pdf.set_font("helvetica", 'I', 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, "This certificate is generated automatically by the Disk Hunter appliance.", align='C')

    pdf.output(filepath)
    return filename