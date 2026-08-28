import io
import os
import pytest
from datetime import date, datetime, time, timezone
import openpyxl
from app.routers.attendance import (
    parse_date_value, parse_time_value, parse_attendance_file_rows, _try_parse_daily_tracker_rows
)
from app.models.models import User, EmployeeProfile, Attendance

def test_daily_tracker_multi_block_parsing():
    """Verify that a multi-block daily task/timesheet spreadsheet parses correctly."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Daily Tracker New format"

    # Day 1 Block
    ws.append(["#", "Employee Name", "Current Date", "Today's Sign In", "Today's Sign Out", "Lunch Time Out", "Lunch Time In", "Project", "Today Task", "Status"])
    ws.append([1, "Muntasib", datetime(2026, 8, 27), "WFH 10:00", None, None, None, "Others", "Festival Post", "Inprogress"])
    ws.append([2, "Haneef", None, time(10, 0), time(7, 0), time(2, 0), time(2, 40), "Others", "Landing page UI", None])
    ws.append([3, "Kishan Rana", None, time(9, 30), time(6, 30), None, None, "Path", "Website", None])

    # Day 2 Block
    ws.append(["#", "Employee Name", "Current Date", "Today's Sign In", "Today's Sign Out", "Lunch Time Out", "Lunch Time In", "Project", "Today Task", "Status"])
    ws.append([1, "Muntasib", "26/8/2026\nWednesday", "10:15 WFH", "WFH 07:00", None, None, "Others", "Animation", "Inprogress"])
    ws.append([2, "Aniket Gupta", None, 10.0, 7.0, None, None, "LMS", "Backend API", None])
    ws.append([3, "Yash Gupta", None, "10:00:00(Half-day)", "02:00:00(Half-day)", None, None, "PLM", "Mocks", None])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    records = parse_attendance_file_rows(file_bytes, "anarish_tracker.xlsx")
    assert len(records) == 6

    # Verify Day 1
    r0 = records[0]
    assert r0["employee_raw"] == "Muntasib"
    assert r0["date_raw"] == date(2026, 8, 27)
    assert r0["clock_in_raw"] == "WFH 10:00"

    r1 = records[1]
    assert r1["employee_raw"] == "Haneef"
    assert r1["date_raw"] == date(2026, 8, 27)  # Inherited date
    assert r1["lunch_out_raw"] == time(2, 0)
    assert r1["lunch_in_raw"] == time(2, 40)

    # Verify Day 2
    r3 = records[3]
    assert r3["employee_raw"] == "Muntasib"
    assert r3["date_raw"] == date(2026, 8, 26)

    r4 = records[4]
    assert r4["employee_raw"] == "Aniket Gupta"
    assert r4["date_raw"] == date(2026, 8, 26)
    assert r4["clock_in_raw"] == 10.0
    assert r4["clock_out_raw"] == 7.0

def test_time_parsing_special_formats():
    """Verify custom float, string, and biometric annotations parse accurately."""
    d = date(2026, 8, 27)
    
    # Floats / Ints
    t_in = parse_time_value(10.0, d, is_clock_out=False)
    assert t_in == datetime(2026, 8, 27, 10, 0, 0, tzinfo=timezone.utc)
    t_out = parse_time_value(7.0, d, is_clock_out=True)
    assert t_out == datetime(2026, 8, 27, 19, 0, 0, tzinfo=timezone.utc)

    # WFH Strings
    t_wfh_in = parse_time_value("WFH 10:25", d, is_clock_out=False)
    assert t_wfh_in.hour == 10 and t_wfh_in.minute == 25
    t_wfh_out = parse_time_value("WFH 07:35", d, is_clock_out=True)
    assert t_wfh_out.hour == 19 and t_wfh_out.minute == 35

    # Biometric / Multiline notes
    t_bio = parse_time_value("10:55\n( The Biometric machine \nis not working )", d, is_clock_out=False)
    assert t_bio.hour == 10 and t_bio.minute == 55

def test_import_with_user_actual_file_if_available():
    """If the user's Excel file is present on disk, test that it parses all 3,600+ records cleanly."""
    file_path = r"C:\Users\LENOVO\Downloads\Anarish Daily Tasks - 22 July (1).xlsx"
    if not os.path.exists(file_path):
        pytest.skip("User download file not found")

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    records = parse_attendance_file_rows(file_bytes, os.path.basename(file_path))
    assert len(records) > 3500
    # Verify sample record integrity
    first_rec = records[0]
    assert first_rec["employee_raw"] != ""
    assert isinstance(first_rec["date_raw"], (date, datetime))
