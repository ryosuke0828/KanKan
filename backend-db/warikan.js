function calculateWarikan(participants, weights, totalAmount) {
    if (!Array.isArray(participants) || participants.length === 0) {
        throw new Error('Invalid input: participants must be a non-empty array.');
    }
    if (typeof weights !== 'object' || weights === null || Object.keys(weights).length === 0) {
        throw new Error('Invalid input: weights must be a non-empty object.');
    }
    if (typeof totalAmount !== 'number' || totalAmount <= 0) {
        throw new Error('Invalid input: totalAmount must be a positive number.');
    }

    let totalWeightUnits = 0;
    const participantDetails = [];

    for (const p of participants) {
        if (typeof p !== 'object' || p === null || typeof p.name !== 'string' || typeof p.grade !== 'string') {
            throw new Error(`Invalid participant format: ${JSON.stringify(p)}`);
        }
        const weight = weights[p.grade];
        if (typeof weight !== 'number' || weight < 0) {
            throw new Error(`Invalid or missing weight for grade: ${p.grade}`);
        }
        participantDetails.push({ ...p, weight });
        totalWeightUnits += weight;
    }

    if (totalWeightUnits <= 0) {
        throw new Error('Calculation error: Total weight units must be positive.');
    }

    const amountPerUnit = totalAmount / totalWeightUnits;

    const gradePayments = {};
    for (const grade in weights) {
        if (Object.hasOwnProperty.call(weights, grade)) {
             gradePayments[grade] = 0;
        }
    }


    for (const p of participantDetails) {
        const payment = amountPerUnit * p.weight;
        if (gradePayments.hasOwnProperty(p.grade)) {
             gradePayments[p.grade] += payment;
        }
    }

    for (const grade in gradePayments) {
      gradePayments[grade] = Math.ceil(gradePayments[grade] / 10) * 10;
    }

    return gradePayments;
}

module.exports = {
    calculateWarikan
};
