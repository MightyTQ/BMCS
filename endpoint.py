from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import autogen
from autogen import AssistantAgent, UserProxyAgent
import re
from typing import List, Dict, Any

app = Flask(__name__)
CORS(app)

CONVERSATION_LOG = "conversation_log.json"  # File to save conversation history

llm_config = {
    "config_list": [{"model": "gpt-4o-mini", "api_key": os.environ.get("OPENAI_API_KEY")}]
}

def clean_json_response(raw_content: str) -> str:
    """Clean JSON response to remove markdown or formatting artifacts."""
    return re.sub(r"^```(json)?\\n|```$", "", raw_content, flags=re.MULTILINE).strip()

decision_agent = autogen.AssistantAgent(
    name="DecisionAgent",
    llm_config=llm_config,
    system_message="""
    You are an assistant that decides how to proceed based on user input. 
    Classify the user request into one of the following categories:
    1. "first_time_request": User is explicitly asking for course schedule planning for the first time. 
       - The user mentions their academic background (e.g., major in EECS, CS) or prior courses taken.
       - The user asks for help with planning classes, exploring new courses, or creating a class schedule for the next semester.
       - Keywords include phrases like "plan my class schedule," "explore courses," or "help me choose classes."
    2. "follow_up_request": User asks follow-up questions about a previous recommendation (e.g., removing a course, finding alternatives).
       - The user references prior recommendations or specific courses mentioned earlier.
       - Keywords include phrases like "I don't want this course," "find a different course," or "update the schedule."
    3. "general_query": User asks random questions unrelated to course scheduling.
       - The query does not involve course recommendations or planning. 
       - Examples include general questions like "What is the weather?" or other unrelated topics.

    Ensure the response is valid JSON and matches this format exactly!
    {
        "category": "first_time_request" / "follow_up_request" / "general_query",
        "reason": "Brief explanation of why the input falls into this category."
    }"""
)

chat_agent = autogen.AssistantAgent(
    name="ChatAgent",
    llm_config=llm_config,
    system_message="You are a helpful assistant who answers any random questions posed by the user."
)

followup_agent = autogen.AssistantAgent(
    name="FollowUpAgent",
    llm_config=llm_config,
    system_message="""
    You are a follow-up assistant for course recommendations. Your role is to update recommendations when a user expresses dissatisfaction with a specific course.

    Given the user's request and the previous conversation log (including the list of available courses and current recommendations), follow these rules:
    1. Identify the course the user wants to exclude based on its course code or title.
    2. Find a suitable alternative from the available courses that:
       - Was not already recommended.
       - Has a decent alignment score and fits the student's interests.
    3. Replace the unwanted course with the new course, and keep the rest of the recommendations unchanged. Make sure you're only returning 4 courses.
    4. Return an updated JSON list of recommendations in this format:
    [
        {
            "course_id": xxx,
            "course_code": "course_code",
            "title": "course title",
            "reason": "Updated reason for recommendation",
            "average_grade": "A/B/C/etc.",
            "workload": "high/medium/low",
            "enrollment_difficulty": "easy/medium/hard",
            "class_times": ["list of class times"],
            "comments": "Updated comments about the course."
        }
    ]
    
    Respond with valid JSON only (no additional explanations or markdown)."""
)

parser = AssistantAgent(
    name="ParserAgent",
    llm_config=llm_config,
    system_message="""
    You are a parser agent that extracts course information and interests from student input.
    ALWAYS format your response as a JSON string with exactly two fields:
    {
        "taken_courses": [list of course codes/names found in input],
        "interests": [list of interests/subjects found in input]
    }"""
)

interest_matcher = AssistantAgent(
    name="InterestMatchingAgent",
    llm_config=llm_config,
    system_message="""
    You are an expert at evaluating course alignment with student interests.
    You will receive a JSON containing all available courses and student interests.You must evaluate EVERY course given to you and return top 10 courses.
    For each course, assign an alignment score (0-10) based on how well the description matches the interests.
    Respond with a JSON array **only** (do not include any additional text, formatting, or markdown like ```json).
    Ensure the response is valid JSON and matches this format exactly:
    [
        {
            "course_id": xxx,
            "course_code": "course_code",
            "title": "actual course title",
            "alignment_score": (0-10),
            "explanation": "Brief explanation"
        },
        ...
    ]
    Only include courses that exist in the input JSON. Return an empty array [] if no courses match the interests."""
)

enhancer = AssistantAgent(
    name="EnhancerAgent",
    llm_config=llm_config,
    system_message="""
    You enhance course recommendations by adding grading and workload information.
    Given a JSON list of courses with their alignment scores, update each course with the following fields:
    {
        "average_grade": "value from database field 'grade'",
        "workload": "high/medium/low",
        "comments": "Brief workload and grade analysis."
    }
    Important:
    - Use the 'grade' field from the course database for "average_grade". Do not make up the grade.
    - CS 189, CS 162, EECS 126, CS 179, CS 182 are high workload classes. Assign 'high' workload to these courses.
    - For other courses, infer workload based on general difficulty: assume 'medium' unless explicitly stated otherwise.
    
    Only output a Json that is python evaluable. Do not print anything else."""
)

recommender = AssistantAgent(
    name="RecommenderAgent",
    llm_config=llm_config,
    system_message="""
    You are a course recommendation specialist.
    From the input JSON list of courses, select the top 4 courses that:
    - Have the highest alignment scores
    - Do not have time conflicts (use the provided class_times field)
    - Assess enrollment difficulty using the 'enrolled' and 'max_enroll' fields.
    
    Provide the following fields for each recommendation:
    {
        "course_id": xxx,
        "course_code": "course_code",
        "title": "course title",
        "reason": "Why it is recommended",
        "average_grade": "A/B/C/etc.",
        "workload": "high/medium/low",
        "enrollment_difficulty": "easy/medium/hard",
        "class_times": "class_times",
        "comments": "Brief analysis including workload, grade, and enrollment difficulty."
    }
    Guidelines:
    - Calculate enrollment difficulty based on the ratio: enrolled / max_enroll.
        * If the ratio is > 0.9, it is 'hard'.
        * If the ratio is between 0.7 and 0.9, it is 'medium'.
        * If the ratio is below 0.7, it is 'easy'.
    
    Respond with valid JSON only (no additional explanations or markdown).
    """
)

user_proxy = UserProxyAgent(
    name="StudentProxy",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=1,
    code_execution_config={"work_dir": "workdir", "use_docker": False}
)

def load_course_database() -> List[Dict]:
    """Load course data from JSON file"""
    with open('/Users/godt/Desktop/BMCS/frontend/app/data/courses_data_23-24-ALL.json', 'r') as f:
        return json.load(f)

def save_conversation_log(data):
    with open(CONVERSATION_LOG, 'w') as f:
        json.dump(data, f, indent=2)

def load_conversation_log():
    if os.path.exists(CONVERSATION_LOG):
        with open(CONVERSATION_LOG, 'r') as f:
            return json.load(f)
    return None

def terminate_if_parsed(message):
    try:
        parsed = json.loads(message)
        return "taken_courses" in parsed and "interests" in parsed
    except json.JSONDecodeError:
        return False

def process_recommendations(user_input: str, courses_database: List[Dict]) -> str:
    # Step 1: Parse input
    parse_response = user_proxy.initiate_chat(
        parser,
        message=f"Extract courses and interests from: {user_input}",
        max_consecutive_auto_reply=0,
        termination_fn=terminate_if_parsed
    )
    cleaned_response = clean_json_response(parse_response.chat_history[-3]['content'])
    parsed_data = json.loads(cleaned_response)

    # Step 2: Remove already-taken courses
    available_courses = [
        course for course in courses_database
        if not any(taken.lower() in course['course_code'].lower() or
                   taken in str(course['class_id'])
                   for taken in parsed_data['taken_courses'])
    ]

    # Step 3: Evaluate available courses
    evaluation_msg = json.dumps({
        "available_courses": available_courses,
        "interests": parsed_data['interests']
    })
    eval_response = user_proxy.initiate_chat(
        interest_matcher,
        message=f"Evaluate the alignment of these courses: {evaluation_msg}",
        max_consecutive_auto_reply=0
    )
    cleaned_eval_response = clean_json_response(eval_response.chat_history[-3]['content'])
    evaluated_courses = json.loads(cleaned_eval_response)

    # Step 4: Add course data and enhance
    for course in evaluated_courses:
        course_db = next((c for c in courses_database if c['class_id'] == course['course_id']), None)
        if course_db:
            course.update({
                'average_grade': course_db.get('grade', "N/A"),
                'class_times': course_db.get('class_times', []),
                'enrolled': course_db.get('enrolled', 0),
                'max_enroll': course_db.get('max_enroll', 0)
            })

    enhancement_msg = json.dumps(evaluated_courses)
    enhance_response = user_proxy.initiate_chat(
        enhancer,
        message=f"Enhance these courses with grading and workload data: {enhancement_msg}",
        max_consecutive_auto_reply=0
    )
    cleaned_enhance_response = clean_json_response(enhance_response.chat_history[-1]['content'])
    enhanced_courses = json.loads(cleaned_enhance_response)

    # Step 5: Final Recommendations
    recommendation_msg = json.dumps(enhanced_courses)
    final_response = user_proxy.initiate_chat(
        recommender,
        message=f"Provide the top 4 course recommendations: {recommendation_msg}",
        max_consecutive_auto_reply=0
    )
    cleaned_final_response = clean_json_response(final_response.chat_history[-3]['content'])
    final_recommendations = json.loads(cleaned_final_response)
    
    # Save conversation log
    save_conversation_log({
        "user_input": user_input,
        "available_courses": evaluated_courses,
        "recommendations": final_recommendations
    })

    return final_recommendations

def process_followup(user_input: str) -> str:
    conversation_data = load_conversation_log()
    if not conversation_data:
        return json.dumps({
            "error": "No previous conversation found",
            "message": "Please start with a new course request."
        })

    followup_message = json.dumps({
        "user_request": user_input,
        "available_courses": conversation_data["available_courses"],
        "current_recommendations": conversation_data["recommendations"]
    })

    followup_response = user_proxy.initiate_chat(
        followup_agent,
        message=f"Update the course recommendations: {followup_message}",
        max_consecutive_auto_reply=0
    )

    cleaned_response = clean_json_response(followup_response.chat_history[-1]['content'])
    updated_recommendations = json.loads(cleaned_response)

    conversation_data["recommendations"] = updated_recommendations
    save_conversation_log(conversation_data)
    
    return updated_recommendations

def process_general_query(user_input: str) -> str:
    chat_response = user_proxy.initiate_chat(
        chat_agent,
        message=user_input,
        max_consecutive_auto_reply=0
    )
    return clean_json_response(chat_response.chat_history[-1]['content'])

@app.route('/api/recommend', methods=['POST'])
def recommend_courses():
    try:
        print("Received request:", request.json)
        
        data = request.json 
        user_input = data.get('message')
        
        if not user_input:
            return jsonify({
                'error': 'No message provided',
                'details': 'The message field is required in the request body'
            }), 400

        # Load database
        try:
            courses_database = load_course_database()
            print("Database loaded successfully with", len(courses_database), "courses")
        except Exception as e:
            return jsonify({
                'error': 'Database loading error',
                'details': str(e)
            }), 500

        # Determine request type
        decision_response = user_proxy.initiate_chat(
            decision_agent,
            message=user_input,
            max_consecutive_auto_reply=0
        )
        cleaned_decision = clean_json_response(decision_response.chat_history[-3]['content'])
        decision = json.loads(cleaned_decision)

        # Process based on request type
        try:
            if decision["category"] == "first_time_request":
                recommendations = process_recommendations(user_input, courses_database)
                return jsonify({
                    'recommendations': recommendations,
                    'message': 'Successfully generated initial recommendations'
                })

            elif decision["category"] == "follow_up_request":
                updated_recommendations = process_followup(user_input)
                return jsonify({
                    'recommendations': updated_recommendations,
                    'message': 'Successfully updated recommendations'
                })

            elif decision["category"] == "general_query":
                response = process_general_query(user_input)
                return jsonify({
                    'message': response,
                    'type': 'general_response'
                })

            else:
                return jsonify({
                    'error': 'Invalid request category',
                    'details': 'Could not determine the type of request'
                }), 400

        except Exception as e:
            print("Processing error:", str(e))
            return jsonify({
                'error': 'Processing error',
                'details': str(e)
            }), 500

    except Exception as e:
        print("Unexpected error:", str(e))
        return jsonify({
            'error': 'Unexpected error',
            'details': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=2000)