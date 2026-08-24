import json
import logging
import re
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger("aurawork.ai")

SYSTEM_INSTRUCTION = """You are AuraHR AI, an empathetic, highly professional, and accurate Corporate HR & Workplace Policy Assistant.
Your job is to answer employee and admin questions strictly based on the provided Company Policy Knowledge Base and the Employee's live HR profile.

Guidelines:
1. Always be polite, concise, professional, and clear.
2. If asked about leave balances, working hours, or WFH status, use the Employee's Live Profile data provided in the context.
3. If asked about rules, timings, holidays, notice periods, or reimbursements, refer directly to the Company Policies provided in the context.
4. If a question cannot be answered from the provided company policies or context, politely inform the user to reach out to their HR Department or Reporting Manager directly.
5. Format your answers clearly using bullet points, bold text, and markdown where appropriate.
6. Do NOT invent policies or guess numbers not found in the context.
"""

def generate_ai_chat_response(
    user_message: str,
    company_name: str,
    employee_context: Dict[str, Any],
    policies: List[Dict[str, str]],
    office_settings: Optional[Dict[str, Any]] = None,
    holidays: Optional[List[Dict[str, Any]]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """
    Generates a context-aware HR assistant response using Google Gemini 1.5 Flash
    or an intelligent rule-based contextual fallback engine.
    """
    # 1. Compile context
    policy_texts = []
    matched_sources = []
    
    for pol in policies:
        title = pol.get("title", "Policy")
        category = pol.get("category", "General")
        content = pol.get("content", "")
        policy_texts.append(f"### Policy: {title} (Category: {category})\n{content}\n")
        
        # Check source match
        query_words = re.findall(r"\w+", user_message.lower())
        if any(w in title.lower() or w in category.lower() for w in query_words if len(w) > 3):
            matched_sources.append(title)

    policies_block = "\n".join(policy_texts) if policy_texts else "No custom policies uploaded yet."

    holidays_str = ", ".join([f"{h.get('name')} ({h.get('date')})" for h in (holidays or [])]) or "None configured"
    
    office_info = ""
    if office_settings:
        office_info = (
            f"Office Hours: {office_settings.get('office_start_time', '09:30')} to {office_settings.get('office_end_time', '18:30')} | "
            f"Timezone: {office_settings.get('timezone', 'Asia/Kolkata')} | "
            f"Lunch Break: {office_settings.get('lunch_break_hours', 1.0)} hr | "
            f"Required Hours: {office_settings.get('required_working_hours', 8.0)} hrs | "
            f"Weekends: {office_settings.get('weekends', 'Saturday,Sunday')}"
        )

    context_prompt = f"""--- CONTEXT FOR {company_name.upper()} ---
Employee Live Profile:
- Name: {employee_context.get('name', 'Employee')}
- Email: {employee_context.get('email', 'N/A')}
- Role: {employee_context.get('role', 'Employee')}
- Department: {employee_context.get('department', 'General')}
- Designation: {employee_context.get('designation', 'Staff')}
- Casual Leave Balance: {employee_context.get('leave_balance_casual', 0)} days
- Sick Leave Balance: {employee_context.get('leave_balance_sick', 0)} days
- Paid Leave Balance: {employee_context.get('leave_balance_paid', 0)} days
- WFH Enabled: {employee_context.get('wfh_enabled', False)}
- Today's Status: {employee_context.get('today_status', 'Not Clocked In')}

Office Settings:
{office_info}

Upcoming Gazetted Holidays:
{holidays_str}

Company Policy Documents:
{policies_block}
--- END CONTEXT ---
"""

    # 2. If GEMINI_API_KEY is configured, call Gemini 1.5 Flash API
    if settings.GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
            
            contents = []
            if chat_history:
                for msg in chat_history[-6:]:
                    role = "user" if msg.get("role") == "user" else "model"
                    contents.append({
                        "role": role,
                        "parts": [{"text": msg.get("content", "")}]
                    })
            
            # Append current message with context
            prompt_content = f"{context_prompt}\nUser Question: {user_message}"
            contents.append({
                "role": "user",
                "parts": [{"text": prompt_content}]
            })

            payload = {
                "systemInstruction": {
                    "parts": [{"text": SYSTEM_INSTRUCTION}]
                },
                "contents": contents,
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": 800,
                }
            }

            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                res_body = json.loads(response.read().decode("utf-8"))
                candidates = res_body.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        reply_text = parts[0]["text"].strip()
                        return {
                            "reply": reply_text,
                            "sources": matched_sources or ["Company Handbook"]
                        }
        except Exception as e:
            logger.warning(f"Gemini API request failed ({e}); switching to contextual rule fallback.")

    # 3. Fallback Contextual Assistant Engine (Runs with zero external dependencies)
    msg_lower = user_message.lower()
    
    # A. Leave Balance Queries
    if "leave balance" in msg_lower or "how many leave" in msg_lower or "remaining leave" in msg_lower or "casual leave" in msg_lower or "sick leave" in msg_lower:
        c_bal = employee_context.get("leave_balance_casual", 0)
        s_bal = employee_context.get("leave_balance_sick", 0)
        p_bal = employee_context.get("leave_balance_paid", 0)
        total = c_bal + s_bal + p_bal
        reply = (
            f"Hello **{employee_context.get('name', 'there')}**! Here is your current leave balance:\n\n"
            f"- **Casual Leaves**: {c_bal} days\n"
            f"- **Sick Leaves**: {s_bal} days\n"
            f"- **Paid Leaves**: {p_bal} days\n"
            f"- **Total Available**: **{total} days**\n\n"
            f"You can apply for leaves directly from the **Leave Management** section on your portal."
        )
        return {"reply": reply, "sources": ["Employee Profile", "Leave Policy"]}

    # B. Office Timings & Working Hours
    if "office time" in msg_lower or "working hour" in msg_lower or "timing" in msg_lower or "lunch" in msg_lower:
        start_t = office_settings.get("office_start_time", "09:30") if office_settings else "09:30"
        end_t = office_settings.get("office_end_time", "18:30") if office_settings else "18:30"
        lunch = office_settings.get("lunch_break_hours", 1.0) if office_settings else 1.0
        req_hrs = office_settings.get("required_working_hours", 8.0) if office_settings else 8.0
        weekends = office_settings.get("weekends", "Saturday, Sunday") if office_settings else "Saturday, Sunday"

        reply = (
            f"Here are the official office hours for **{company_name}**:\n\n"
            f"- **Work Timings**: {start_t} to {end_t} IST\n"
            f"- **Required Daily Hours**: {req_hrs} hours net\n"
            f"- **Lunch Break**: {lunch} hour\n"
            f"- **Weekly Offs**: {weekends}\n"
            f"- **Grace Period**: 15 minutes before marked as Late."
        )
        return {"reply": reply, "sources": ["Office Settings", "Attendance Policy"]}

    # C. Holidays Query
    if "holiday" in msg_lower or "festival" in msg_lower or "off day" in msg_lower:
        if holidays:
            h_lines = "\n".join([f"- **{h.get('name')}**: {h.get('date')} ({h.get('description', 'Public Holiday')})" for h in holidays[:8]])
            reply = f"Here are the upcoming gazetted holidays for **{company_name}**:\n\n{h_lines}\n\nYou can view the complete annual calendar in your employee dashboard."
        else:
            reply = f"There are no upcoming company holidays scheduled at the moment in **{company_name}**."
        return {"reply": reply, "sources": ["Company Holiday Calendar"]}

    # D. Match Policy Documents Content
    for pol in policies:
        title = pol.get("title", "")
        content = pol.get("content", "")
        keywords = re.findall(r"\w+", title.lower())
        if any(kw in msg_lower for kw in keywords if len(kw) > 3):
            reply = f"Here is the policy regarding **{title}** at **{company_name}**:\n\n{content}"
            return {"reply": reply, "sources": [title]}

    # E. General Help Fallback
    policies_titles = [f"- {p.get('title')}" for p in policies]
    policies_list_str = "\n".join(policies_titles) if policies_titles else "- General Employee Handbook"

    reply = (
        f"I am your **{company_name} HR Policy Assistant**.\n\n"
        f"You can ask me questions about:\n"
        f"- Your current **leave balances** (Casual, Sick, Paid)\n"
        f"- **Office timings**, lunch duration, and late mark rules\n"
        f"- **Upcoming company holidays**\n"
        f"- Specific company policies:\n{policies_list_str}\n\n"
        f"How can I assist you today?"
    )
    return {"reply": reply, "sources": ["AuraHR Knowledge Base"]}
