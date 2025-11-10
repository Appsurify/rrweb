// Form validation and submission logic
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('feedback-form');
    const submitButton = document.getElementById('submit-btn');
    const requiredFields = [
        'firstName',
        'lastName',
        'position',
        'country',
        'industry',
        'date',
        'message'
    ];

    // Get all form inputs
    const inputs = requiredFields.map(fieldId => document.getElementById(fieldId));

    // Function to check if all fields are filled
    function checkFormValidity() {
        const allFilled = inputs.every(input => {
            if (input.type === 'textarea') {
                return input.value.trim() !== '';
            }
            return input.value.trim() !== '';
        });

        submitButton.disabled = !allFilled;
    }

    // Add event listeners to all inputs
    inputs.forEach(input => {
        input.addEventListener('input', checkFormValidity);
        input.addEventListener('change', checkFormValidity);
    });

    // Handle form submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (!submitButton.disabled) {
            // Form is valid, but we don't actually submit
            // Just show a simple message
            alert('Thank you for your feedback! (This is a demo - no data was submitted)');
            
            // Optionally reset the form
            // form.reset();
            // checkFormValidity();
        }
    });

    // Initial check
    checkFormValidity();
});
